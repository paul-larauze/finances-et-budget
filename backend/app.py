import os
from functools import wraps
from flask import Flask, request, jsonify, session, redirect, url_for
from flask_cors import CORS
from database import init_db, get_db

app = Flask(__name__, static_folder="static", static_url_path="/")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
CORS(app, supports_credentials=True)
init_db()

APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

MOIS_NOMS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
             "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]


# ── AUTH ───────────────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if APP_PASSWORD and not session.get("logged_in"):
            return jsonify({"error": "Non authentifié"}), 401
        return f(*args, **kwargs)
    return decorated


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    if data.get("password") == APP_PASSWORD:
        session["logged_in"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "Mot de passe incorrect"}), 401


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/status", methods=["GET"])
def auth_status():
    if not APP_PASSWORD:
        return jsonify({"authenticated": True, "password_required": False})
    return jsonify({
        "authenticated": session.get("logged_in", False),
        "password_required": True,
    })


# ── MONTHLY ENTRY ──────────────────────────────────────────────────────────────

@app.route("/api/monthly", methods=["GET"])
@login_required
def get_monthly():
    annee = request.args.get("annee", type=int)
    mois = request.args.get("mois", type=int)
    conn = get_db()
    c = conn.cursor()
    entry = c.execute(
        "SELECT * FROM monthly_entries WHERE annee=? AND mois=?", (annee, mois)
    ).fetchone()
    rep = c.execute(
        "SELECT * FROM repartition WHERE annee=? AND mois=?", (annee, mois)
    ).fetchone()
    virements = c.execute("SELECT * FROM virements_fixes ORDER BY id").fetchall()
    conn.close()

    total_fixes = sum(v["montant"] for v in virements)
    salaire = (entry["salaire"] or 0) if entry else 0

    return jsonify({
        "salaire": salaire,
        "repartition": {
            "pea": rep["pea"] if rep else 1.0,
            "livret_a": rep["livret_a"] if rep else 0.0,
            "cto": rep["cto"] if rep else 0.0,
            "crypto": rep["crypto"] if rep else 0.0,
        },
        "total_fixes": total_fixes,
        "disponible": salaire - total_fixes,
    })


@app.route("/api/monthly", methods=["POST"])
@login_required
def save_monthly():
    data = request.json
    annee, mois = data["annee"], data["mois"]
    salaire = data["salaire"]
    rep = data["repartition"]
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO monthly_entries (annee, mois, salaire) VALUES (?,?,?) "
        "ON CONFLICT(annee, mois) DO UPDATE SET salaire=excluded.salaire",
        (annee, mois, salaire),
    )
    c.execute(
        "INSERT INTO repartition (annee, mois, pea, livret_a, cto, crypto) VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(annee, mois) DO UPDATE SET pea=excluded.pea, livret_a=excluded.livret_a, "
        "cto=excluded.cto, crypto=excluded.crypto",
        (annee, mois, rep["pea"], rep["livret_a"], rep["cto"], rep["crypto"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/month/<int:annee>/<int:mois>", methods=["DELETE"])
@login_required
def delete_month(annee, mois):
    conn = get_db()
    conn.execute("DELETE FROM monthly_entries WHERE annee=? AND mois=?", (annee, mois))
    conn.execute("DELETE FROM repartition WHERE annee=? AND mois=?", (annee, mois))
    conn.execute("DELETE FROM placements WHERE annee=? AND mois=?", (annee, mois))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── PRÉLÈVEMENTS AUTO ──────────────────────────────────────────────────────────

@app.route("/api/prelevements", methods=["GET"])
@login_required
def get_prelevements():
    conn = get_db()
    rows = conn.execute("SELECT * FROM prelevements_auto ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/prelevements", methods=["POST"])
@login_required
def save_prelevement():
    data = request.json
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE prelevements_auto SET libelle=?, banque=?, montant=?, mois_specifique=? WHERE id=?",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique"), data["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO prelevements_auto (libelle, banque, montant, mois_specifique) VALUES (?,?,?,?)",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique")),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/prelevements/<int:pid>", methods=["DELETE"])
@login_required
def delete_prelevement(pid):
    conn = get_db()
    conn.execute("DELETE FROM prelevements_auto WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── VIREMENTS FIXES ────────────────────────────────────────────────────────────

@app.route("/api/virements-fixes", methods=["GET"])
@login_required
def get_virements_fixes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM virements_fixes ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/virements-fixes", methods=["POST"])
@login_required
def save_virement_fixe():
    data = request.json
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE virements_fixes SET libelle=?, banque=?, montant=? WHERE id=?",
            (data["libelle"], data["banque"], data["montant"], data["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO virements_fixes (libelle, banque, montant) VALUES (?,?,?)",
            (data["libelle"], data["banque"], data["montant"]),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/virements-fixes/<int:vid>", methods=["DELETE"])
@login_required
def delete_virement_fixe(vid):
    conn = get_db()
    conn.execute("DELETE FROM virements_fixes WHERE id=?", (vid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── VIREMENTS COMPTES JOINTS ──────────────────────────────────────────────────

@app.route("/api/virements-cj", methods=["GET"])
@login_required
def get_virements_cj():
    conn = get_db()
    rows = conn.execute("SELECT * FROM virements_cj ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/virements-cj", methods=["POST"])
@login_required
def save_virement_cj():
    data = request.json
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE virements_cj SET libelle=?, banque=?, montant=?, mois_specifique=? WHERE id=?",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique"), data["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO virements_cj (libelle, banque, montant, mois_specifique) VALUES (?,?,?,?)",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique")),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/virements-cj/<int:cid>", methods=["DELETE"])
@login_required
def delete_virement_cj(cid):
    conn = get_db()
    conn.execute("DELETE FROM virements_cj WHERE id=?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── SUPPORTS ───────────────────────────────────────────────────────────────────

@app.route("/api/supports", methods=["GET"])
@login_required
def get_supports():
    conn = get_db()
    rows = conn.execute("SELECT * FROM supports ORDER BY categorie, id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/supports", methods=["POST"])
@login_required
def add_support():
    data = request.json
    conn = get_db()
    conn.execute("INSERT INTO supports (nom, categorie) VALUES (?,?)", (data["nom"], data["categorie"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/supports/<int:sid>", methods=["DELETE"])
@login_required
def delete_support(sid):
    conn = get_db()
    conn.execute("DELETE FROM supports WHERE id=?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── PLACEMENTS ─────────────────────────────────────────────────────────────────

@app.route("/api/placements", methods=["GET"])
@login_required
def get_placements():
    annee = request.args.get("annee", type=int)
    mois = request.args.get("mois", type=int)
    conn = get_db()
    supports = conn.execute("SELECT * FROM supports ORDER BY categorie, id").fetchall()
    rows = conn.execute(
        "SELECT * FROM placements WHERE annee=? AND mois=?", (annee, mois)
    ).fetchall()
    prev_annee, prev_mois = (annee - 1, 12) if mois == 1 else (annee, mois - 1)
    prev_rows = conn.execute(
        "SELECT support, montant FROM placements WHERE annee=? AND mois=?",
        (prev_annee, prev_mois),
    ).fetchall()
    conn.close()

    prev_map = {r["support"]: r["montant"] for r in prev_rows}
    existing = {r["support"]: dict(r) for r in rows}
    result = {"livrets": [], "bourse": []}
    for s in supports:
        e = existing.get(s["nom"], {})
        result[s["categorie"]].append({
            "support_id": s["id"],
            "support": s["nom"],
            "categorie": s["categorie"],
            "montant": e.get("montant", 0),
            "prev": prev_map.get(s["nom"], 0),
        })
    return jsonify(result)


@app.route("/api/placements", methods=["POST"])
@login_required
def save_placements():
    data = request.json
    annee, mois = data["annee"], data["mois"]
    conn = get_db()
    for item in data["placements"]:
        conn.execute(
            "INSERT INTO placements (annee, mois, support, categorie, montant) VALUES (?,?,?,?,?) "
            "ON CONFLICT(annee, mois, support) DO UPDATE SET montant=excluded.montant",
            (annee, mois, item["support"], item["categorie"], item["montant"]),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── HISTORIQUE ─────────────────────────────────────────────────────────────────

@app.route("/api/historique", methods=["GET"])
@login_required
def get_historique():
    conn = get_db()
    rows = conn.execute("""
        SELECT p.annee, p.mois,
            SUM(CASE WHEN p.categorie='livrets' THEN p.montant ELSE 0 END) as livrets,
            SUM(CASE WHEN p.categorie='bourse' THEN p.montant ELSE 0 END) as bourse,
            SUM(p.montant) as total
        FROM placements p
        GROUP BY p.annee, p.mois
        HAVING SUM(p.montant) > 0
        ORDER BY p.annee, p.mois
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ── GRAPHES ────────────────────────────────────────────────────────────────────

@app.route("/api/graphes/evolution", methods=["GET"])
@login_required
def get_graphes_evolution():
    conn = get_db()
    rows = conn.execute("""
        SELECT annee, mois, support, categorie, montant
        FROM placements WHERE montant > 0
        ORDER BY annee, mois, categorie, support
    """).fetchall()
    conn.close()

    months_set = sorted({(r["annee"], r["mois"]) for r in rows})
    labels = [f"{MOIS_NOMS[m][:3]} {str(a)[2:]}" for a, m in months_set]
    month_idx = {am: i for i, am in enumerate(months_set)}

    livrets_supports, bourse_supports, seen = [], [], {}
    for r in rows:
        s = r["support"]
        if s not in seen:
            seen[s] = {"support": s, "categorie": r["categorie"], "data": [0] * len(months_set)}
            (livrets_supports if r["categorie"] == "livrets" else bourse_supports).append(seen[s])
        seen[s]["data"][month_idx[(r["annee"], r["mois"])]] = r["montant"]

    totals = [0] * len(months_set)
    livrets_totals = [0] * len(months_set)
    bourse_totals = [0] * len(months_set)
    for r in rows:
        i = month_idx[(r["annee"], r["mois"])]
        totals[i] += r["montant"]
        if r["categorie"] == "livrets":
            livrets_totals[i] += r["montant"]
        else:
            bourse_totals[i] += r["montant"]

    return jsonify({
        "labels": labels, "totals": totals,
        "livrets_totals": livrets_totals, "bourse_totals": bourse_totals,
        "livrets_supports": livrets_supports, "bourse_supports": bourse_supports,
    })


# ── EXPORT / IMPORT ────────────────────────────────────────────────────────────

@app.route("/api/export", methods=["GET"])
@login_required
def export_data():
    conn = get_db()
    data = {
        "monthly_entries": [dict(r) for r in conn.execute("SELECT * FROM monthly_entries ORDER BY annee, mois").fetchall()],
        "repartition": [dict(r) for r in conn.execute("SELECT * FROM repartition ORDER BY annee, mois").fetchall()],
        "virements_fixes": [dict(r) for r in conn.execute("SELECT * FROM virements_fixes ORDER BY id").fetchall()],
        "prelevements_auto": [dict(r) for r in conn.execute("SELECT * FROM prelevements_auto ORDER BY id").fetchall()],
        "virements_cj": [dict(r) for r in conn.execute("SELECT * FROM virements_cj ORDER BY id").fetchall()],
        "supports": [dict(r) for r in conn.execute("SELECT * FROM supports ORDER BY id").fetchall()],
        "placements": [dict(r) for r in conn.execute("SELECT * FROM placements ORDER BY annee, mois, support").fetchall()],
    }
    conn.close()
    from flask import Response
    import json
    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": "attachment; filename=finances-export.json"},
    )


@app.route("/api/import", methods=["POST"])
@login_required
def import_data():
    data = request.json
    conn = get_db()
    c = conn.cursor()

    tables = [
        ("monthly_entries", ["annee", "mois", "salaire"]),
        ("repartition", ["annee", "mois", "pea", "livret_a", "cto", "crypto"]),
        ("virements_fixes", ["libelle", "banque", "montant"]),
        ("prelevements_auto", ["libelle", "banque", "montant", "mois_specifique"]),
        ("virements_cj", ["libelle", "banque", "montant", "mois_specifique"]),
        ("supports", ["nom", "categorie"]),
        ("placements", ["annee", "mois", "support", "categorie", "montant"]),
    ]

    for table, cols in tables:
        if table not in data:
            continue
        c.execute(f"DELETE FROM {table}")
        for row in data[table]:
            vals = [row.get(col) for col in cols]
            placeholders = ",".join(["?"] * len(cols))
            c.execute(f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES ({placeholders})", vals)

    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── SPA FALLBACK ───────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5003)
