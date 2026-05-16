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


# ── TRANSACTIONS ───────────────────────────────────────────────────────────────

BOURSOBANK_MAP = {
    "Alimentation": "Alimentation",
    "Restaurants, bars, discothèques…": "Restaurants",
    "Loisirs et sorties": "Loisirs",
    "Dépenses Jeux et paris": "Loisirs",
    "Auto & Moto": "Auto/Moto",
    "Péages": "Transport",
    "Santé": "Santé",
    "Médecins et frais médicaux": "Santé",
    "Pharmacie et laboratoire": "Santé",
    "Remboursements frais de santé": "Santé",
    "Abonnements & téléphonie": "Abonnements",
    "Bricolage et jardinage": "Maison",
    "Mobilier, électroménager, décoration…": "Maison",
    "Electronique et informatique": "Shopping",
    "Livres, CD/DVD, bijoux, jouets…": "Shopping",
    "Vêtements et accessoires": "Habillement",
    "Impôts & Taxes": "Impôts & Charges",
    "Urssaf et charges patronales": "Impôts & Charges",
    "Virements reçus": "Revenus",
    "Virements émis": "Virements",
    "Virements reçus de comptes à comptes": "Virements internes",
    "Virements émis de comptes à comptes": "Virements internes",
    "Mouvements internes créditeurs": "Virements internes",
    "Mouvements internes débiteurs": "Virements internes",
}


def _categorize(supplier, label, category_parent, conn):
    if supplier:
        row = conn.execute(
            "SELECT category FROM supplier_categories WHERE supplier=?",
            (supplier.lower().strip(),),
        ).fetchone()
        if row:
            return row["category"]

    text = ((label or "") + " " + (supplier or "")).lower()
    rules = conn.execute(
        "SELECT keyword, category FROM categorization_rules ORDER BY id"
    ).fetchall()
    for rule in rules:
        if rule["keyword"] in text:
            return rule["category"]

    return BOURSOBANK_MAP.get(category_parent)


def _parse_french_amount(s):
    return float(s.strip().strip('"').replace(' ', '').replace('\xa0', '').replace(' ', '').replace(' ', '').replace(',', '.'))


EXCLUDED_FROM_REPORT = ('Virements internes', 'Virements', 'Revenus', 'Épargne')


@app.route("/api/transactions/rapport", methods=["GET"])
@login_required
def get_rapport():
    from datetime import date
    account_type = request.args.get("account_type", "perso")
    months = request.args.get("months", 6, type=int)

    today = date.today()
    m = today.month - months
    y = today.year
    while m <= 0:
        m += 12
        y -= 1
    start = f"{y}-{m:02d}-01"

    conn = get_db()

    placeholders = ",".join("?" * len(EXCLUDED_FROM_REPORT))
    base_params = [account_type, start] + list(EXCLUDED_FROM_REPORT)

    by_cat = conn.execute(f"""
        SELECT COALESCE(my_category, 'Non catégorisé') as cat,
               ABS(SUM(amount)) as total, COUNT(*) as cnt
        FROM transactions
        WHERE account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY cat ORDER BY total DESC
    """, base_params).fetchall()

    monthly = conn.execute(f"""
        SELECT substr(date_op, 1, 7) as month, ABS(SUM(amount)) as total
        FROM transactions
        WHERE account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY month ORDER BY month
    """, base_params).fetchall()

    monthly_by_cat = conn.execute(f"""
        SELECT substr(date_op, 1, 7) as month,
               COALESCE(my_category, 'Non catégorisé') as cat,
               ABS(SUM(amount)) as total
        FROM transactions
        WHERE account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY month, cat ORDER BY month, total DESC
    """, base_params).fetchall()

    conn.close()

    mois_abbr = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    all_months = sorted({r["month"] for r in monthly_by_cat})
    labels = [f"{mois_abbr[int(m.split('-')[1])]} {m.split('-')[0][2:]}" for m in all_months]

    grand_total = sum(r["total"] for r in by_cat) or 1
    by_cat_list = [
        {"category": r["cat"], "total": round(r["total"], 2),
         "count": r["cnt"], "pct": round(r["total"] / grand_total * 100, 1)}
        for r in by_cat
    ]

    # Build top-N categories for evolution (rest = "Autres")
    TOP_N = 7
    top_cats = [r["category"] for r in by_cat_list[:TOP_N]]
    cat_data = {cat: [0.0] * len(all_months) for cat in top_cats}
    autres_data = [0.0] * len(all_months)
    month_idx = {m: i for i, m in enumerate(all_months)}
    for r in monthly_by_cat:
        i = month_idx[r["month"]]
        if r["cat"] in cat_data:
            cat_data[r["cat"]][i] = round(r["total"], 2)
        else:
            autres_data[i] = round(autres_data[i] + r["total"], 2)

    monthly_series = [{"category": cat, "data": cat_data[cat]} for cat in top_cats if any(cat_data[cat])]
    if any(autres_data):
        monthly_series.append({"category": "Autres", "data": autres_data})

    return jsonify({
        "labels": labels,
        "by_category": by_cat_list,
        "monthly_series": monthly_series,
        "monthly_totals": [round(r["total"], 2) for r in monthly],
    })


@app.route("/api/transactions", methods=["GET"])
@login_required
def get_transactions():
    annee = request.args.get("annee", type=int)
    mois = request.args.get("mois", type=int)
    account_type = request.args.get("account_type", "perso")
    conn = get_db()
    if annee and mois:
        prefix = f"{annee}-{mois:02d}"
        rows = conn.execute(
            "SELECT * FROM transactions WHERE date_op LIKE ? AND account_type=? ORDER BY date_op DESC, id DESC",
            (f"{prefix}%", account_type),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE account_type=? ORDER BY date_op DESC, id DESC LIMIT 500",
            (account_type,),
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/transactions/import", methods=["POST"])
@login_required
def import_transactions():
    import csv
    import io

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Fichier manquant"}), 400

    account_type = request.form.get("account_type", "perso")

    content = file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content), delimiter=";")

    inserted = 0
    skipped = 0
    errors = 0
    conn = get_db()

    for row in reader:
        try:
            amount = _parse_french_amount(row.get("amount", "0"))
            balance_raw = row.get("accountbalance", "").strip()
            balance = _parse_french_amount(balance_raw) if balance_raw else None
            supplier = row.get("supplierFound", "").strip() or None
            cat_parent = row.get("categoryParent", "").strip() or None
            label = row.get("label", "").strip()
            my_cat = _categorize(supplier, label, cat_parent, conn)
            result = conn.execute(
                "INSERT OR IGNORE INTO transactions "
                "(date_op, date_val, label, category, category_parent, supplier, amount, comment, account_num, account_label, account_balance, my_category, account_type) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    row.get("dateOp", "").strip(),
                    row.get("dateVal", "").strip(),
                    label,
                    row.get("category", "").strip() or None,
                    cat_parent,
                    supplier,
                    amount,
                    row.get("comment", "").strip() or None,
                    row.get("accountNum", "").strip() or None,
                    row.get("accountLabel", "").strip() or None,
                    balance,
                    my_cat,
                    account_type,
                ),
            )
            if result.rowcount:
                inserted += 1
            else:
                skipped += 1
        except Exception:
            errors += 1

    conn.commit()
    conn.close()
    return jsonify({"inserted": inserted, "skipped": skipped, "errors": errors})


@app.route("/api/transactions/<int:tid>", methods=["DELETE"])
@login_required
def delete_transaction(tid):
    conn = get_db()
    conn.execute("DELETE FROM transactions WHERE id=?", (tid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/transactions/<int:tid>/category", methods=["PATCH"])
@login_required
def update_transaction_category(tid):
    data = request.json
    category = data.get("category")
    conn = get_db()
    conn.execute("UPDATE transactions SET my_category=? WHERE id=?", (category, tid))
    tx = conn.execute("SELECT supplier FROM transactions WHERE id=?", (tid,)).fetchone()
    if tx and tx["supplier"]:
        conn.execute(
            "INSERT OR REPLACE INTO supplier_categories (supplier, category) VALUES (?,?)",
            (tx["supplier"].lower().strip(), category),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/transactions/recategorize", methods=["POST"])
@login_required
def recategorize_all():
    conn = get_db()
    txs = conn.execute("SELECT id, supplier, label, category_parent FROM transactions").fetchall()
    for tx in txs:
        cat = _categorize(tx["supplier"], tx["label"], tx["category_parent"], conn)
        if cat:
            conn.execute("UPDATE transactions SET my_category=? WHERE id=?", (cat, tx["id"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/categories", methods=["GET"])
@login_required
def get_categories():
    conn = get_db()
    rows = conn.execute("SELECT nom FROM categories ORDER BY id").fetchall()
    conn.close()
    return jsonify([r["nom"] for r in rows])


@app.route("/api/categorization-rules", methods=["GET"])
@login_required
def get_rules():
    conn = get_db()
    rows = conn.execute("SELECT * FROM categorization_rules ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/categorization-rules", methods=["POST"])
@login_required
def add_rule():
    data = request.json
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO categorization_rules (keyword, category) VALUES (?,?)",
        (data["keyword"].lower().strip(), data["category"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/categorization-rules/<int:rid>", methods=["DELETE"])
@login_required
def delete_rule(rid):
    conn = get_db()
    conn.execute("DELETE FROM categorization_rules WHERE id=?", (rid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


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
