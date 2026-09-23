from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.core import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


@router.post("/login")
def login(body: Credentials, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if auth.rate_limited(ip):
        raise HTTPException(429, "Слишком много попыток, подождите минуту")
    if not auth.enabled() or not auth.check_credentials(body.username, body.password):
        auth.register_fail(ip)
        raise HTTPException(401, "Неверный логин или пароль")
    response.set_cookie(auth.COOKIE, auth.issue_token(body.username), max_age=auth.TTL_S,
                        httponly=True, samesite="strict", path="/")
    return {"user": body.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    if not auth.enabled():
        return {"user": "local", "auth": False}
    user = auth.verify_token(request.cookies.get(auth.COOKIE))
    if not user:
        raise HTTPException(401, "Требуется вход")
    return {"user": user, "auth": True}
