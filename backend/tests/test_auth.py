"""Tests for authentication: register, login, logout, status, invite, user management."""

import pytest
from tests.conftest import register, login, make_second_user


class TestRegister:
    def test_first_user_becomes_admin(self, client):
        r = register(client, "alice", "password123")
        assert r.status_code == 201
        assert r.get_json()["is_admin"] is True

    def test_second_user_requires_token(self, client):
        register(client, "alice", "password123")
        r = register(client, "bob", "password123")
        assert r.status_code == 400
        assert "invitation" in r.get_json()["error"].lower()

    def test_short_password_rejected(self, client):
        r = register(client, "alice", "abc")
        assert r.status_code == 400

    def test_duplicate_username_rejected(self, client):
        register(client, "alice", "password123")
        r = register(client, "alice", "otherpass1")
        assert r.status_code == 400


class TestLogin:
    def test_valid_credentials(self, client):
        register(client, "alice", "password123")
        r = login(client, "alice", "password123")
        assert r.status_code == 200
        assert r.get_json()["username"] == "alice"

    def test_wrong_password(self, client):
        register(client, "alice", "password123")
        r = login(client, "alice", "wrongpass1")
        assert r.status_code == 401

    def test_unknown_user(self, client):
        r = login(client, "nobody", "password123")
        assert r.status_code == 401


class TestStatus:
    def test_unauthenticated(self, client):
        r = client.get("/api/auth/status")
        assert r.status_code == 200
        assert r.get_json()["authenticated"] is False

    def test_authenticated(self, auth):
        r = auth.get("/api/auth/status")
        assert r.get_json()["authenticated"] is True
        assert r.get_json()["username"] == "alice"


class TestLogout:
    def test_logout_clears_session(self, auth):
        auth.post("/api/auth/logout")
        r = auth.get("/api/auth/status")
        assert r.get_json()["authenticated"] is False


class TestProtectedRoute:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/categories")
        assert r.status_code == 401


class TestInvite:
    def test_admin_can_generate_invite(self, admin):
        r = admin.post("/api/auth/invite")
        assert r.status_code == 200
        data = r.get_json()
        assert "token" in data
        assert "expires_at" in data

    def test_non_admin_cannot_generate_invite(self, admin, app):
        # Create a second (non-admin) user and check they can't generate an invite
        second = make_second_user(admin, "bob", "bobpass123")
        r = second.post("/api/auth/invite")
        assert r.status_code == 403

    def test_second_user_registers_with_token(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        r = second.get("/api/auth/status")
        assert r.get_json()["username"] == "bob"
        assert r.get_json()["is_admin"] is False

    def test_token_cannot_be_reused(self, admin, app):
        inv = admin.post("/api/auth/invite").get_json()
        token = inv["token"]

        # First use — OK
        second = app.test_client()
        register(second, "bob", "bobpass123", token=token)

        # Second use — should fail
        third = app.test_client()
        r = register(third, "charlie", "charliepass", token=token)
        assert r.status_code == 400


class TestAdminUserManagement:
    def test_admin_lists_users(self, admin):
        r = admin.get("/api/auth/users")
        assert r.status_code == 200
        users = r.get_json()
        assert any(u["username"] == "admin" for u in users)

    def test_non_admin_cannot_list_users(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        r = second.get("/api/auth/users")
        assert r.status_code == 403

    def test_admin_can_delete_user(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        # Get bob's id
        users = admin.get("/api/auth/users").get_json()
        bob = next(u for u in users if u["username"] == "bob")
        r = admin.delete(f"/api/auth/users/{bob['id']}")
        assert r.status_code == 200

    def test_admin_cannot_delete_self(self, admin):
        users = admin.get("/api/auth/users").get_json()
        me = next(u for u in users if u["username"] == "admin")
        r = admin.delete(f"/api/auth/users/{me['id']}")
        assert r.status_code == 400
