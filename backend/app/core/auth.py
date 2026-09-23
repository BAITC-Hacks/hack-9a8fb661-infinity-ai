"""Вход в систему: логин/пароль из окружения, подписанная cookie-сессия (HMAC-SHA256).

APP_PASSWORD пустой — вход отключён (локальная разработка и тесты).
Защита от перебора: не больше LOGIN_MAX_TRIES неудачных попыток с одного IP за LOGIN_WINDOW_S.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque

from app.core import config

COOKIE = "infinity_session"
TTL_S = 12 * 3600
LOGIN_MAX_TRIES = 5
LOGIN_WINDOW_S = 60
_SECRET = (config.APP_SECRET or secrets.token_hex(32)).encode()
_fails: dict[str, deque] = defaultdict(deque)


def enabled() -> bool:
    return bool(config.APP_PASSWORD)


def check_credentials(user: str, password: str) -> bool:
    ok_u = hmac.compare_digest(user.encode(), config.APP_LOGIN.encode())
    ok_p = hmac.compare_digest(password.encode(), config.APP_PASSWORD.encode())
    return ok_u and ok_p


def rate_limited(ip: str) -> bool:
    q = _fails[ip]
    now = time.time()
    while q and now - q[0] > LOGIN_WINDOW_S:
        q.popleft()
    return len(q) >= LOGIN_MAX_TRIES


def register_fail(ip: str):
    _fails[ip].append(time.time())


def issue_token(user: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"u": user, "exp": int(time.time()) + TTL_S}).encode()).decode()
    sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
    except ValueError:
        return None
    return data["u"] if data.get("exp", 0) > time.time() else None
