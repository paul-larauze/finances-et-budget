"""Tests for account tabs: CRUD, default seeding, deletion guard."""

import io
import pytest


def _upload_csv(client, account_type="perso"):
    csv_content = (
        'dateOp;dateVal;label;category;categoryParent;supplierFound;amount;accountNum;accountLabel;accountBalance;comment\n'
        '2025-03-01;2025-03-02;CARREFOUR;Alimentation;Alimentation;carrefour;-20.00;FR76;CC;500.00;\n'
    )
    data = {
        "file": (io.BytesIO(csv_content.encode("utf-8-sig")), "test.csv"),
        "account_type": account_type,
    }
    return client.post("/api/transactions/import", data=data, content_type="multipart/form-data")


class TestAccountTabsDefault:
    def test_new_user_has_two_default_tabs(self, auth):
        r = auth.get("/api/account-tabs")
        assert r.status_code == 200
        tabs = r.get_json()
        slugs = [t["account_type"] for t in tabs]
        assert "perso" in slugs
        assert "joint" in slugs

    def test_default_tabs_have_correct_labels(self, auth):
        tabs = auth.get("/api/account-tabs").get_json()
        labels = {t["account_type"]: t["label"] for t in tabs}
        assert labels["perso"] == "Compte perso"
        assert labels["joint"] == "Compte joint"


class TestAccountTabsAdd:
    def test_add_tab(self, auth):
        r = auth.post("/api/account-tabs", json={"label": "Compte Pro"})
        assert r.status_code == 201
        data = r.get_json()
        assert data["account_type"] == "compte_pro"

        tabs = auth.get("/api/account-tabs").get_json()
        assert any(t["account_type"] == "compte_pro" for t in tabs)

    def test_slug_generated_from_accented_label(self, auth):
        r = auth.post("/api/account-tabs", json={"label": "Épargne Retraite"})
        assert r.status_code == 201
        slug = r.get_json()["account_type"]
        # Accents stripped, spaces → underscore
        assert slug == "epargne_retraite"

    def test_add_tab_requires_label(self, auth):
        r = auth.post("/api/account-tabs", json={"label": ""})
        assert r.status_code == 400

    def test_duplicate_slug_rejected(self, auth):
        auth.post("/api/account-tabs", json={"label": "Compte Pro"})
        r = auth.post("/api/account-tabs", json={"label": "Compte Pro"})
        assert r.status_code == 409


class TestAccountTabsDelete:
    def test_delete_empty_tab(self, auth):
        r = auth.post("/api/account-tabs", json={"label": "Temporaire"})
        tab_id = r.get_json()["id"]
        r2 = auth.delete(f"/api/account-tabs/{tab_id}")
        assert r2.status_code == 200
        tabs = auth.get("/api/account-tabs").get_json()
        assert not any(t["id"] == tab_id for t in tabs)

    def test_delete_blocked_when_transactions_exist(self, auth):
        # Upload a transaction to "perso"
        _upload_csv(auth, account_type="perso")
        tabs = auth.get("/api/account-tabs").get_json()
        perso = next(t for t in tabs if t["account_type"] == "perso")
        r = auth.delete(f"/api/account-tabs/{perso['id']}")
        assert r.status_code == 409
        assert "transaction" in r.get_json()["error"].lower()

    def test_delete_nonexistent_tab(self, auth):
        r = auth.delete("/api/account-tabs/99999")
        assert r.status_code == 404

    def test_cannot_delete_other_users_tab(self, admin, app):
        from tests.conftest import make_second_user
        second = make_second_user(admin, "bob", "bobpass123")
        bob_tabs = second.get("/api/account-tabs").get_json()
        bob_tab_id = bob_tabs[0]["id"]
        r = admin.delete(f"/api/account-tabs/{bob_tab_id}")
        assert r.status_code == 404


class TestAccountTabsIsolation:
    def test_users_see_only_own_tabs(self, admin, app):
        from tests.conftest import make_second_user
        second = make_second_user(admin, "bob", "bobpass123")
        second.post("/api/account-tabs", json={"label": "Bob Special"})

        admin_tabs = admin.get("/api/account-tabs").get_json()
        assert not any(t["label"] == "Bob Special" for t in admin_tabs)
