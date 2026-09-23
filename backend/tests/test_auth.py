from fastapi.testclient import TestClient

from app.core import auth, config
from app.main import app


def test_login_required_when_password_set(monkeypatch):
    monkeypatch.setattr(config, "APP_LOGIN", "op")
    monkeypatch.setattr(config, "APP_PASSWORD", "s3cret-pass")
    auth._fails.clear()
    c = TestClient(app)
    assert c.get("/api/objects").status_code == 401
    assert c.get("/api/health").status_code == 200
    assert c.post("/api/auth/login", json={"username": "op", "password": "wrong"}).status_code == 401
    r = c.post("/api/auth/login", json={"username": "op", "password": "s3cret-pass"})
    assert r.status_code == 200 and auth.COOKIE in r.cookies
    assert c.get("/api/objects").status_code == 200
    assert c.get("/api/auth/me").json()["user"] == "op"


def test_bruteforce_is_limited(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "s3cret-pass")
    auth._fails.clear()
    c = TestClient(app)
    codes = [c.post("/api/auth/login", json={"username": "x", "password": "y"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[-1] == 429


def test_forged_token_rejected():
    assert auth.verify_token("eyJ1IjoiYWRtaW4iLCJleHAiOjk5OTk5OTk5OTl9.deadbeef") is None
