"""Tests for virements, prélèvements, categorization rules, and export/import."""


class TestCategorizationRules:
    def test_default_rules_seeded(self, auth):
        r = auth.get("/api/categorization-rules")
        assert r.status_code == 200
        assert len(r.get_json()) > 0

    def test_add_rule(self, auth):
        r = auth.post("/api/categorization-rules", json={"keyword": "netflix", "category": "Abonnements"})
        assert r.status_code == 200
        rules = auth.get("/api/categorization-rules").get_json()
        assert any(rule["keyword"] == "netflix" for rule in rules)

    def test_add_rule_is_upsert(self, auth):
        auth.post("/api/categorization-rules", json={"keyword": "netflix", "category": "Abonnements"})
        auth.post("/api/categorization-rules", json={"keyword": "netflix", "category": "Loisirs"})
        rules = auth.get("/api/categorization-rules").get_json()
        netflix_rules = [r for r in rules if r["keyword"] == "netflix"]
        assert len(netflix_rules) == 1
        assert netflix_rules[0]["category"] == "Loisirs"

    def test_delete_rule(self, auth):
        auth.post("/api/categorization-rules", json={"keyword": "mytest", "category": "Loisirs"})
        rules = auth.get("/api/categorization-rules").get_json()
        rid = next(r["id"] for r in rules if r["keyword"] == "mytest")
        auth.delete(f"/api/categorization-rules/{rid}")
        rules2 = auth.get("/api/categorization-rules").get_json()
        assert not any(r["keyword"] == "mytest" for r in rules2)


class TestVirementsFixesCRUD:
    def test_add_and_list(self, auth):
        r = auth.post("/api/virements-fixes", json={"libelle": "Loyer", "banque": "BNP", "montant": 800})
        assert r.status_code == 200
        items = auth.get("/api/virements-fixes").get_json()
        assert any(v["libelle"] == "Loyer" for v in items)

    def test_delete(self, auth):
        auth.post("/api/virements-fixes", json={"libelle": "Loyer", "banque": "BNP", "montant": 800})
        items = auth.get("/api/virements-fixes").get_json()
        vid = next(v["id"] for v in items if v["libelle"] == "Loyer")
        auth.delete(f"/api/virements-fixes/{vid}")
        items2 = auth.get("/api/virements-fixes").get_json()
        assert not any(v["id"] == vid for v in items2)


class TestPrelevementsCRUD:
    def test_add_and_list(self, auth):
        r = auth.post("/api/prelevements", json={"libelle": "EDF", "banque": "Bourso", "montant": 75})
        assert r.status_code == 200
        items = auth.get("/api/prelevements").get_json()
        assert any(p["libelle"] == "EDF" for p in items)

    def test_add_with_mois_specifique(self, auth):
        auth.post("/api/prelevements", json={"libelle": "Taxe foncière", "banque": "Bourso", "montant": 400, "mois_specifique": 10})
        items = auth.get("/api/prelevements").get_json()
        t = next(p for p in items if p["libelle"] == "Taxe foncière")
        assert t["mois_specifique"] == 10

    def test_delete(self, auth):
        auth.post("/api/prelevements", json={"libelle": "EDF", "banque": "Bourso", "montant": 75})
        items = auth.get("/api/prelevements").get_json()
        pid = next(p["id"] for p in items if p["libelle"] == "EDF")
        auth.delete(f"/api/prelevements/{pid}")
        items2 = auth.get("/api/prelevements").get_json()
        assert not any(p["id"] == pid for p in items2)


class TestExportImport:
    def test_export_returns_json(self, auth):
        r = auth.get("/api/export")
        assert r.status_code == 200
        data = r.get_json()
        assert "monthly_entries" in data
        assert "virements_fixes" in data

    def test_import_restores_data(self, auth):
        # Seed data
        auth.post("/api/virements-fixes", json={"libelle": "Loyer", "banque": "BNP", "montant": 800})
        export = auth.get("/api/export").get_json()

        # Delete original
        items = auth.get("/api/virements-fixes").get_json()
        vid = items[0]["id"]
        auth.delete(f"/api/virements-fixes/{vid}")

        # Re-import
        r = auth.post("/api/import", json=export)
        assert r.status_code == 200
        items2 = auth.get("/api/virements-fixes").get_json()
        assert any(v["libelle"] == "Loyer" for v in items2)

    def test_export_requires_auth(self, client):
        r = client.get("/api/export")
        assert r.status_code == 401


class TestUsersList:
    def test_returns_other_users_only(self, admin, app):
        from tests.conftest import make_second_user
        make_second_user(admin, "bob", "bobpass123")
        r = admin.get("/api/users")
        assert r.status_code == 200
        users = r.get_json()
        # Should include bob but NOT admin (self)
        assert any(u["username"] == "bob" for u in users)
        assert not any(u["username"] == "admin" for u in users)

    def test_no_passwords_in_response(self, admin, app):
        from tests.conftest import make_second_user
        make_second_user(admin, "bob", "bobpass123")
        users = admin.get("/api/users").get_json()
        for u in users:
            assert "password" not in u
            assert "password_hash" not in u
