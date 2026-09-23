import json
import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_agent, get_store, optional_issue_date
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


@router.get("/agent")
def agent_chat(q: str = Query(..., min_length=2, max_length=500)):
    """SSE-поток: tool_call / tool_result / answer / done."""
    def stream():
        try:
            for ev in ask(q, get_agent):
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
        except Exception as e:
            log.exception("chat failed")
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)}, ensure_ascii=False)}\n\n"
        yield 'data: {"type": "done"}\n\n'
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
