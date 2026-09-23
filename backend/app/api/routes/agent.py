import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse

from app.api.deps import get_agent, get_store, issue_date_param, optional_issue_date
from app.schemas.agent import AgentLogEntry
from app.services.chat import ask

router = APIRouter(tags=["agent"])
log = logging.getLogger(__name__)


@router.get("/log", response_model=list[AgentLogEntry])
def agent_log(issue_date: str | None = Depends(optional_issue_date),
              limit: int = Query(200, ge=1, le=2000), store=Depends(get_store)):
    rows = store.agent_log(issue_date, limit)
    for r in rows:
        for k in ("params", "result"):
            if r.get(k):
                r[k] = json.loads(r[k])
    return rows


@router.get("/alerts")
def alerts(issue_date: str = Depends(issue_date_param), turbine: str = Query("STATION", pattern="^(STATION|T1|T2)$")):
    """Уведомления агента: резкие изменения выработки (ΔP), штиль, отсечка, обледенение, решения агента."""
    from app.services.alerts import build_alerts
    return build_alerts(issue_date, turbine)


@router.get("/agent")
def agent_chat(q: str = Query(..., min_length=1, max_length=1000),
               lang: str = Query("ru", pattern="^(ru|kk)$"),
               mode: str = Query("fast", pattern="^(fast|medium|deep)$"),
               session: str = Query("", max_length=64, pattern="^[A-Za-z0-9_-]*$"),
               issue_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
               turbine: str | None = Query(None, pattern="^(STATION|T1|T2)$"),
               files: str = Query("", max_length=400, pattern="^[a-f0-9,]*$")):
    """SSE-поток: tool_call / tool_result / thinking / answer / done.
    mode — быстрый/средний/думающий; session — память диалога; issue_date/turbine — контекст экрана."""
    ctx = {"issue_date": issue_date, "turbine": turbine, "files": [f for f in files.split(",") if f]}

    def stream():
        try:
            for ev in ask(q, get_agent, lang, mode, session, ctx):
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
        except Exception as e:
            log.exception("chat failed")
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)}, ensure_ascii=False)}\n\n"
        yield 'data: {"type": "done"}\n\n'
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/files")
async def upload_file(file: UploadFile = File(...), session: str = Form(..., max_length=64, pattern="^[A-Za-z0-9_-]+$")):
    """Вложение к диалогу: docx/doc/pdf/xlsx/csv/jpg/png/txt до 15 МБ, читается в память сессии."""
    from app.services import files as fs
    data = await file.read(fs.MAX_BYTES + 1)
    try:
        return fs.save(session, file.filename or "file", data)
    except fs.FileError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        log.exception("file parse failed")
        raise HTTPException(422, f"Не удалось прочитать файл: {e}")


class ReportIn(BaseModel):
    question: str = Field("", max_length=2000)
    answer: str = Field(..., max_length=20000)
    issue_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    turbine: str = Field("STATION", pattern="^(STATION|T1|T2)$")


@router.post("/report/{fmt}")
def report(fmt: str, body: ReportIn):
    """Ответ агента в Word или Excel: вопрос, ответ, ключевые числа, графики, уведомления, почасовая таблица."""
    from app.services.reports import build_docx, build_xlsx
    if fmt == "docx":
        data, mime = build_docx(body.question, body.answer, body.issue_date, body.turbine), \
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif fmt == "xlsx":
        data, mime = build_xlsx(body.question, body.answer, body.issue_date, body.turbine), \
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise HTTPException(404, "Формат: docx или xlsx")
    name = f"infinity_{body.turbine}_{body.issue_date}.{fmt}"
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{name}"'})
