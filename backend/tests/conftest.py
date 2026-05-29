"""
Shared fixtures for all tests.

Strategy:
- Each test gets a fresh temporary DATA_DIR → isolated SQLite DB
- `client`  : unauthenticated Flask test client
- `auth`    : helper that returns an authenticated client (regular user)
- `admin`   : authenticated client whose user has is_admin=1
"""

import os
import sys
import tempfile
import pytest

# Make sure `backend/` is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


@pytest.fixture()
def app(tmp_path, monkeypatch):
    """Fresh Flask app backed by a temp DB for every test."""
    # Point database module at the temp dir BEFORE importing app
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    # Force re-import so init_db() runs against the fresh DB
    import importlib
    import database
    import app as app_module

    importlib.reload(database)
    importlib.reload(app_module)

    app_module.app.config["TESTING"] = True
    app_module.app.config["SECRET_KEY"] = "test-secret"

    yield app_module.app


@pytest.fixture()
def client(app):
    return app.test_client()


# ── helpers ────────────────────────────────────────────────────────────────────

def register(client, username="alice", password="password123", token=None):
    payload = {"username": username, "password": password}
    if token:
        payload["token"] = token
    return client.post("/api/auth/register", json=payload)


def login(client, username="alice", password="password123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.fixture()
def auth(client):
    """Authenticated client (first user → admin, but treated as regular user fixture)."""
    register(client, "alice", "password123")
    login(client, "alice", "password123")
    return client


@pytest.fixture()
def admin(client):
    """Authenticated admin client (first registered user is always admin)."""
    register(client, "admin", "adminpass1")
    login(client, "admin", "adminpass1")
    return client


def make_second_user(admin_client, username="bob", password="bobpass123"):
    """Register a second user via invite flow, return its client."""
    # Generate invite
    inv = admin_client.post("/api/auth/invite")
    token = inv.get_json()["token"]

    # Create a fresh client (different session) for the second user
    from flask import current_app
    second = current_app.test_client()
    register(second, username, password, token=token)
    login(second, username, password)
    return second
