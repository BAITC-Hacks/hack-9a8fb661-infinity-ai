"""Optional original GFS archive for strict historical runs (no hindcasts)."""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import numpy as np
import pandas as pd

from backend.app.forecasting.wind_hackathon import local_time, stamp
from backend.app.forecasting.wind_weather_archive import ArchiveError, digest, http_session, save_json

FIELDS = {
    "u100": ("UGRD", "100 m above ground"),
    "v100": ("VGRD", "100 m above ground"),
    "temp": ("TMP", "2 m above ground"),
}
DECODE_LOCK = Lock()


def field_ranges(index):
    entries = [line.split(":") for line in index.splitlines() if line.strip()]
    found = {}
    for n, entry in enumerate(entries[:-1]):
        for name, (variable, level) in FIELDS.items():
            if entry[3:5] == [variable, level]:
                found[name] = (int(entry[1]), int(entries[n + 1][1]) - 1)
    if set(found) != set(FIELDS):
        raise ArchiveError("GFS index lacks mandatory wind/temperature messages")
    return found


def decode_points(content, objects, issue, lead):
    try:
        import eccodes as ec
    except ImportError as exc:
        raise ArchiveError("NOAA requires: pip install -r backend/requirements-wind-noaa.txt") from exc
    with DECODE_LOCK:
        handle = ec.codes_new_from_message(content)
        try:
            initial = pd.to_datetime(
                f"{ec.codes_get(handle, 'dataDate')}{int(ec.codes_get(handle, 'dataTime')):04d}",
                format="%Y%m%d%H%M",
                utc=True,
            )
            valid = pd.to_datetime(
                f"{ec.codes_get(handle, 'validityDate')}{int(ec.codes_get(handle, 'validityTime')):04d}",
                format="%Y%m%d%H%M",
                utc=True,
            )
            if initial != issue or valid != issue + pd.Timedelta(hours=lead):
                raise ArchiveError("GRIB timestamps differ from requested issue/lead")
            result = []
            for obj in objects:
                point = dict(ec.codes_grib_find_nearest(handle, obj["latitude"], obj["longitude"])[0])
                if not math.isfinite(point["value"]) or abs(point["value"]) > 1e10:
                    raise ArchiveError("Missing GRIB point")
                result.append(point)
            return result
        finally:
            ec.codes_release(handle)


class NoaaGfsArchive:
    provider = "noaa-gfs"
    weather_model = "gfs_0p25"

    def __init__(self, cache_dir, *, session=None, workers=4):
        self.cache_dir = Path(cache_dir)
        self.session = session or http_session()
        self.workers = workers

    def candidates(self, origin, count=4):
        # Actual Last-Modified is checked below; four hours is only a search heuristic.
        latest = (local_time(origin).tz_convert("UTC") - pd.Timedelta(hours=4)).floor("6h")
        return [latest - pd.Timedelta(hours=6 * n) for n in range(count)]

    def _point_file(self, objects, issue, lead, refresh):
        url = (
            "https://noaa-gfs-bdp-pds.s3.amazonaws.com/"
            f"gfs.{issue:%Y%m%d}/{issue:%H}/atmos/gfs.t{issue:%H}z.pgrb2.0p25.f{lead:03d}"
        )
        identity = {"url": url, "objects": objects, "fields": FIELDS, "decoder_version": 1}
        cache = self.cache_dir / "noaa-gfs" / (digest(identity) + ".json")
        if cache.exists() and not refresh:
            result = json.loads(cache.read_text(encoding="utf-8"))
            if result["checksum"] != digest(result["data"]):
                raise ArchiveError("NOAA point cache checksum mismatch")
            return result["data"]
        response = self.session.get(url + ".idx", timeout=(10, 60))
        response.raise_for_status()
        ranges = field_ranges(response.text)
        values, publications, hashes = {}, [], []
        for field, (start, end) in ranges.items():
            with self.session.get(
                url, headers={"Range": f"bytes={start}-{end}"}, timeout=(10, 60), stream=True
            ) as response:
                response.raise_for_status()
                if response.status_code != 206 or not response.headers.get("Content-Range", "").startswith(
                    f"bytes {start}-{end}/"
                ):
                    raise ArchiveError("GFS server did not honor the exact byte range")
                # Check headers before reading, never download the entire ~500 MB object.
                content = response.content
                modified = response.headers.get("Last-Modified")
            if len(content) != end - start + 1:
                raise ArchiveError("Truncated GFS range")
            if not modified:
                raise ArchiveError("GFS publication timestamp unavailable")
            published = pd.Timestamp(modified).tz_convert("UTC")
            if published < issue:
                raise ArchiveError("GFS publication precedes initialisation")
            publications.append(published)
            hashes.append(hashlib.sha256(content).hexdigest())
            values[field] = decode_points(content, objects, issue, lead)
        data = {
            "url": url,
            "lead": lead,
            "available_at": stamp(max(publications)),
            "values": values,
            "source_sha256": digest(hashes),
        }
        save_json(cache, {"data": data, "checksum": digest(data)})
        return data

    def fetch(self, objects, issue, *, refresh=False):
        issue = local_time(issue).tz_convert("UTC")
        if issue != issue.floor("6h"):
            raise ArchiveError("GFS initialisation must lie on a six-hour UTC cycle")
        # Explicit 3-hour source sampling limits archive bandwidth; hourly rows are
        # interpolated in vector space, never across an absent source file.
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            files = list(
                pool.map(lambda lead: self._point_file(objects, issue, lead, refresh), range(0, 73, 3))
            )
        availability = max(local_time(f["available_at"]) for f in files)
        signature = digest([f["source_sha256"] for f in files])
        rows = []
        for n, obj in enumerate(objects):
            for lead in range(73):
                left = files[lead // 3]
                right = files[min((lead + 2) // 3, 24)]
                fraction = (lead % 3) / 3
                values = {
                    field: (
                        (1 - fraction) * left["values"][field][n]["value"]
                        + fraction * right["values"][field][n]["value"]
                    )
                    for field in FIELDS
                }
                point = left["values"]["u100"][n]
                rows.append(
                    {
                        "object_id": int(obj["object_id"]),
                        "provider": self.provider,
                        "weather_model": self.weather_model,
                        "issued_at": stamp(issue),
                        "available_at": stamp(availability),
                        "valid_at": stamp(issue + pd.Timedelta(hours=lead)),
                        "wind_speed_100m_ms": float(np.hypot(values["u100"], values["v100"])),
                        "wind_direction_100m_deg": float(
                            np.degrees(np.arctan2(-values["u100"], -values["v100"])) % 360
                        ),
                        "temperature_2m_c": values["temp"] - 273.15,
                        "source_url": left["url"],
                        "source_sha256": signature,
                        "archive_kind": "operational_grib_3h_interpolated",
                        "availability_basis": "max_s3_last_modified_of_all_required_grib_files",
                        "requested_latitude": float(obj["latitude"]),
                        "requested_longitude": float(obj["longitude"]),
                        "grid_latitude": float(point["lat"]),
                        "grid_longitude": float(point["lon"]),
                    }
                )
        return rows
