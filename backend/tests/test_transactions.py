"""Tests for transactions: CRUD, CSV import (BoursoBank + AXA), rapport, categorization."""

import io
import pytest


# ── CSV fixtures ───────────────────────────────────────────────────────────────

BOURSOBANK_CSV = """\
dateOp;dateVal;label;category;categoryParent;supplierFound;amount;accountNum;accountLabel;accountBalance;comment
2025-02-15;2025-02-16;CARREFOUR CITY;Alimentation;Alimentation;carrefour;-45.50;FR76123;Compte Courant;1200.00;
2025-02-20;2025-02-21;PHARMACIE DU CENTRE;Pharmacie et laboratoire;Santé;pharmacie;-32.00;FR76123;Compte Courant;1168.00;
2025-02-25;2025-02-26;VIREMENT SALAIRE;Virements reçus;Revenus;;3000.00;FR76123;Compte Courant;4168.00;
"""

AXA_CSV = """\
Date operation;Date valeur;Libelle;Debit;Credit;Solde
"10/02/2025";"11/02/2025";"LIDL COURSES";"38,00";"";"900,00"
"14/02/2025";"15/02/2025";"REMBOURSEMENT SECU";"";"80,00";"980,00"
"""


def _upload_csv(client, content, account_type="perso", filename="test.csv"):
    data = {
        "file": (io.BytesIO(content.encode("utf-8-sig")), filename),
        "account_type": account_type,
    }
    return client.post(
        "/api/transactions/import",
        data=data,
        content_type="multipart/form-data",
    )


class TestTransactionImport:
    def test_boursobank_import(self, auth):
        r = _upload_csv(auth, BOURSOBANK_CSV)
        assert r.status_code == 200
        data = r.get_json()
        assert data["inserted"] == 3
        assert data["skipped"] == 0
        assert data["format"] == "boursobank"

    def test_axa_import(self, auth):
        r = _upload_csv(auth, AXA_CSV)
        assert r.status_code == 200
        data = r.get_json()
        assert data["inserted"] == 2
        assert data["format"] == "axa"

    def test_duplicate_skipped(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = _upload_csv(auth, BOURSOBANK_CSV)
        data = r.get_json()
        assert data["inserted"] == 0
        assert data["skipped"] == 3

    def test_import_requires_file(self, auth):
        r = auth.post("/api/transactions/import", data={}, content_type="multipart/form-data")
        assert r.status_code == 400

    def test_transactions_stored_with_correct_account_type(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV, account_type="joint")
        rows = auth.get("/api/transactions?account_type=joint").get_json()
        assert len(rows) == 3
        # Should not appear on perso
        rows_perso = auth.get("/api/transactions?account_type=perso").get_json()
        assert len(rows_perso) == 0


class TestTransactionRead:
    def test_filter_by_month(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = auth.get("/api/transactions?annee=2025&mois=2&account_type=perso")
        assert r.status_code == 200
        rows = r.get_json()
        assert len(rows) == 3

    def test_filter_different_month_returns_empty(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = auth.get("/api/transactions?annee=2025&mois=3&account_type=perso")
        assert r.get_json() == []

    def test_requires_auth(self, client):
        r = client.get("/api/transactions?account_type=perso")
        assert r.status_code == 401


class TestTransactionDelete:
    def test_delete_own_transaction(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        rows = auth.get("/api/transactions?account_type=perso").get_json()
        tid = rows[0]["id"]
        r = auth.delete(f"/api/transactions/{tid}")
        assert r.status_code == 200
        rows2 = auth.get("/api/transactions?account_type=perso").get_json()
        assert all(t["id"] != tid for t in rows2)

    def test_cannot_delete_other_users_transaction(self, admin, app):
        from tests.conftest import make_second_user
        second = make_second_user(admin, "bob", "bobpass123")
        _upload_csv(second, BOURSOBANK_CSV)
        bob_rows = second.get("/api/transactions?account_type=perso").get_json()
        tid = bob_rows[0]["id"]
        # admin tries to delete bob's transaction
        r = admin.delete(f"/api/transactions/{tid}")
        # Row should still exist for bob
        bob_rows2 = second.get("/api/transactions?account_type=perso").get_json()
        assert any(t["id"] == tid for t in bob_rows2)


class TestTransactionCategory:
    def test_patch_category(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        rows = auth.get("/api/transactions?account_type=perso").get_json()
        tid = rows[0]["id"]
        cats = auth.get("/api/categories").get_json()
        # Pick any leaf category
        leaf = cats[0]["subcategories"][0]["nom"] if cats[0]["subcategories"] else cats[0]["nom"]
        r = auth.patch(f"/api/transactions/{tid}/category", json={"category": leaf})
        assert r.status_code == 200
        rows2 = auth.get("/api/transactions?account_type=perso").get_json()
        updated = next(t for t in rows2 if t["id"] == tid)
        assert updated["my_category"] == leaf

    def test_auto_categorization_on_import(self, auth):
        """Transactions with supplier 'carrefour' should be auto-categorized via default rules."""
        _upload_csv(auth, BOURSOBANK_CSV)
        rows = auth.get("/api/transactions?account_type=perso").get_json()
        carrefour = next((t for t in rows if "CARREFOUR" in t["label"]), None)
        assert carrefour is not None
        # The supplier 'carrefour' maps to 'Alimentation' via default categorization rules
        assert carrefour["my_category"] == "Alimentation"


class TestRapport:
    def test_rapport_groups_by_parent(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = auth.get("/api/transactions/rapport?account_type=perso&year=2025&months=2&group_by=parent")
        assert r.status_code == 200
        data = r.get_json()
        by_cat = {c["category"]: c["total"] for c in data["by_category"]}
        # PHARMACIE maps to my_category="Santé" (sub of "Frais standards") via BOURSOBANK_MAP
        # "Santé" has no naming collision → its parent "Frais standards" is returned correctly
        assert "Frais standards" in by_cat
        assert abs(by_cat["Frais standards"] - 32.0) < 0.01

    def test_rapport_groups_by_subcategory(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = auth.get("/api/transactions/rapport?account_type=perso&year=2025&months=2&group_by=subcategory")
        assert r.status_code == 200
        data = r.get_json()
        by_cat = {c["category"]: c["total"] for c in data["by_category"]}
        # At subcategory level: Alimentation=45.5, Santé=32.0
        assert abs(by_cat.get("Alimentation", 0) - 45.5) < 0.01
        assert abs(by_cat.get("Santé", 0) - 32.0) < 0.01

    def test_rapport_excludes_revenus(self, auth):
        _upload_csv(auth, BOURSOBANK_CSV)
        r = auth.get("/api/transactions/rapport?account_type=perso&year=2025&months=2")
        data = r.get_json()
        categories = [c["category"] for c in data["by_category"]]
        assert "Revenus" not in categories

    def test_rapport_empty_month(self, auth):
        r = auth.get("/api/transactions/rapport?account_type=perso&year=2025&months=6")
        assert r.status_code == 200
        assert r.get_json()["by_category"] == []
