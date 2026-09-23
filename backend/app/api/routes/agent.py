import json
import logging

from fastapi import APIRouter, Depends, Query
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
               turbine: str | None = Query(None, pattern="^(STATION|T1|T2)$")):
    """SSE-поток: tool_call / tool_result / thinking / answer / done.
    mode — быстрый/средний/думающий; session — память диалога; issue_date/turbine — контекст экрана."""
    ctx = {"issue_date": issue_date, "turbine": turbine}

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
