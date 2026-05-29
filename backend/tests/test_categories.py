"""Tests for categories CRUD and cross-user import."""

import pytest
from tests.conftest import make_second_user


class TestCategoriesCRUD:
    def test_default_categories_seeded(self, auth):
        r = auth.get("/api/categories")
        assert r.status_code == 200
        cats = r.get_json()
        assert len(cats) > 0

    def test_add_parent_category(self, auth):
        r = auth.post("/api/categories", json={"nom": "Vacances", "parent_id": None})
        assert r.status_code == 201
        cats = auth.get("/api/categories").get_json()
        assert any(c["nom"] == "Vacances" for c in cats)

    def test_add_subcategory(self, auth):
        # Get an existing parent
        cats = auth.get("/api/categories").get_json()
        parent = cats[0]
        r = auth.post("/api/categories", json={"nom": "Sous-test", "parent_id": parent["id"]})
        assert r.status_code == 201
        cats2 = auth.get("/api/categories").get_json()
        parent2 = next(c for c in cats2 if c["id"] == parent["id"])
        assert any(s["nom"] == "Sous-test" for s in parent2["subcategories"])

    def test_rename_category(self, auth):
        r = auth.post("/api/categories", json={"nom": "Ancien", "parent_id": None})
        cid = r.get_json()["id"]
        auth.patch(f"/api/categories/{cid}", json={"nom": "Nouveau"})
        cats = auth.get("/api/categories").get_json()
        assert any(c["nom"] == "Nouveau" for c in cats)
        assert not any(c["nom"] == "Ancien" for c in cats)

    def test_delete_empty_category(self, auth):
        r = auth.post("/api/categories", json={"nom": "ASupprimer", "parent_id": None})
        cid = r.get_json()["id"]
        auth.delete(f"/api/categories/{cid}")
        cats = auth.get("/api/categories").get_json()
        assert not any(c["nom"] == "ASupprimer" for c in cats)

    def test_add_category_requires_name(self, auth):
        r = auth.post("/api/categories", json={"nom": "", "parent_id": None})
        assert r.status_code == 400

    def test_move_subcategory(self, auth):
        cats = auth.get("/api/categories").get_json()
        # Need at least 2 parents
        p1, p2 = cats[0], cats[1]
        # Add sub to p1
        r = auth.post("/api/categories", json={"nom": "MobileSub", "parent_id": p1["id"]})
        sub_id = r.get_json()["id"]
        # Move to p2
        auth.patch(f"/api/categories/{sub_id}/move", json={"parent_id": p2["id"]})
        cats2 = auth.get("/api/categories").get_json()
        new_p2 = next(c for c in cats2 if c["id"] == p2["id"])
        assert any(s["nom"] == "MobileSub" for s in new_p2["subcategories"])


class TestCategoryIsolation:
    def test_users_see_only_own_categories(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        # bob adds a category
        second.post("/api/categories", json={"nom": "BobOnly", "parent_id": None})
        # admin should not see it
        cats = admin.get("/api/categories").get_json()
        assert not any(c["nom"] == "BobOnly" for c in cats)


class TestImportCategories:
    def test_import_copies_categories(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        # bob adds a unique category
        second.post("/api/categories", json={"nom": "BobCat", "parent_id": None})

        # Get bob's user id
        users = admin.get("/api/users").get_json()
        bob = next(u for u in users if u["username"] == "bob")

        # admin imports from bob
        r = admin.post(f"/api/categories/import-from/{bob['id']}")
        assert r.status_code == 200
        result = r.get_json()
        assert result["added_parents"] >= 1

        cats = admin.get("/api/categories").get_json()
        assert any(c["nom"] == "BobCat" for c in cats)

    def test_import_skips_duplicates(self, admin, app):
        second = make_second_user(admin, "bob", "bobpass123")
        users = admin.get("/api/users").get_json()
        bob = next(u for u in users if u["username"] == "bob")

        # Import twice
        admin.post(f"/api/categories/import-from/{bob['id']}")
        r2 = admin.post(f"/api/categories/import-from/{bob['id']}")
        data = r2.get_json()
        # Second import adds nothing
        assert data["added_parents"] == 0
        assert data["added_subs"] == 0

    def test_cannot_import_from_self(self, admin):
        users = admin.get("/api/auth/users").get_json()
        me = next(u for u in users if u["username"] == "admin")
        r = admin.post(f"/api/categories/import-from/{me['id']}")
        assert r.status_code == 400

    def test_import_from_unknown_user(self, admin):
        r = admin.post("/api/categories/import-from/99999")
        assert r.status_code == 404
