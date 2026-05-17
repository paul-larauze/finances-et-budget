import os
import uuid
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from database import init_db, get_db, seed_new_user

app = Flask(__name__, static_folder="static", static_url_path="/")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
CORS(app, supports_credentials=True)
init_db()

MOIS_NOMS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
             "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

INVITE_EXPIRY_HOURS = 48


# ── AUTH ───────────────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "Non authentifié"}), 401
        g.user_id = user_id
        g.is_admin = session.get("is_admin", False)
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "Non authentifié"}), 401
        if not session.get("is_admin"):
            return jsonify({"error": "Accès réservé à l'administrateur"}), 403
        g.user_id = user_id
        g.is_admin = True
        return f(*args, **kwargs)
    return decorated


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE username=?", (username,)
    ).fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Identifiants incorrects"}), 401

    session.clear()
    session["user_id"] = user["id"]
    session["is_admin"] = bool(user["is_admin"])
    return jsonify({"ok": True, "username": user["username"], "is_admin": bool(user["is_admin"])})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/status", methods=["GET"])
def auth_status():
    user_id = session.get("user_id")
    if not user_id:
        # Tell the frontend if registration is still open (no users yet)
        conn = get_db()
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        conn.close()
        return jsonify({
            "authenticated": False,
            "first_user": user_count == 0,
        })
    conn = get_db()
    user = conn.execute("SELECT username, is_admin FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not user:
        session.clear()
        return jsonify({"authenticated": False, "first_user": False})
    return jsonify({
        "authenticated": True,
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
    })


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    token = (data.get("token") or "").strip()

    if not username or not password:
        return jsonify({"error": "Nom d'utilisateur et mot de passe requis"}), 400
    if len(password) < 8:
        return jsonify({"error": "Le mot de passe doit contenir au moins 8 caractères"}), 400

    conn = get_db()
    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    is_first_user = user_count == 0

    if not is_first_user:
        # Validate invite token
        if not token:
            conn.close()
            return jsonify({"error": "Jeton d'invitation requis"}), 400
        inv = conn.execute(
            "SELECT * FROM invitation_tokens WHERE token=?", (token,)
        ).fetchone()
        if not inv:
            conn.close()
            return jsonify({"error": "Jeton invalide"}), 400
        if inv["used_at"]:
            conn.close()
            return jsonify({"error": "Jeton déjà utilisé"}), 400
        if datetime.utcnow().isoformat() > inv["expires_at"]:
            conn.close()
            return jsonify({"error": "Jeton expiré"}), 400

    existing = conn.execute(
        "SELECT id FROM users WHERE username=?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Ce nom d'utilisateur est déjà pris"}), 400

    password_hash = generate_password_hash(password)
    is_admin = 1 if is_first_user else 0
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,?)",
        (username, password_hash, is_admin),
    )
    new_user_id = cursor.lastrowid

    if not is_first_user:
        conn.execute(
            "UPDATE invitation_tokens SET used_at=?, used_by=? WHERE token=?",
            (datetime.utcnow().isoformat(), new_user_id, token),
        )

    conn.commit()
    seed_new_user(conn, new_user_id)
    conn.close()

    session.clear()
    session["user_id"] = new_user_id
    session["is_admin"] = bool(is_admin)
    return jsonify({"ok": True, "username": username, "is_admin": bool(is_admin)}), 201


# ── ADMIN: USER MANAGEMENT ─────────────────────────────────────────────────────

@app.route("/api/auth/users", methods=["GET"])
@admin_required
def list_users():
    conn = get_db()
    users = conn.execute(
        "SELECT id, username, is_admin, created_at FROM users ORDER BY id"
    ).fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])


@app.route("/api/auth/users/<int:uid>", methods=["DELETE"])
@admin_required
def delete_user(uid):
    if uid == g.user_id:
        return jsonify({"error": "Impossible de supprimer votre propre compte"}), 400
    conn = get_db()
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/auth/invite", methods=["POST"])
@admin_required
def create_invite():
    token = str(uuid.uuid4())
    expires_at = (datetime.utcnow() + timedelta(hours=INVITE_EXPIRY_HOURS)).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO invitation_tokens (token, created_by, expires_at) VALUES (?,?,?)",
        (token, g.user_id, expires_at),
    )
    conn.commit()
    conn.close()
    return jsonify({"token": token, "expires_at": expires_at})


@app.route("/api/auth/invites", methods=["GET"])
@admin_required
def list_invites():
    conn = get_db()
    rows = conn.execute("""
        SELECT i.token, i.created_at, i.expires_at, i.used_at, u.username as used_by_username
        FROM invitation_tokens i
        LEFT JOIN users u ON u.id = i.used_by
        ORDER BY i.created_at DESC
    """).fetchall()
    conn.close()
    now = datetime.utcnow().isoformat()
    result = []
    for r in rows:
        d = dict(r)
        d["expired"] = not d["used_at"] and d["expires_at"] < now
        result.append(d)
    return jsonify(result)


# ── MONTHLY ENTRY ──────────────────────────────────────────────────────────────

@app.route("/api/monthly", methods=["GET"])
@login_required
def get_monthly():
    annee = request.args.get("annee", type=int)
    mois = request.args.get("mois", type=int)
    uid = g.user_id
    conn = get_db()
    c = conn.cursor()
    entry = c.execute(
        "SELECT * FROM monthly_entries WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois)
    ).fetchone()
    rep = c.execute(
        "SELECT * FROM repartition WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois)
    ).fetchone()
    virements = c.execute(
        "SELECT * FROM virements_fixes WHERE user_id=? ORDER BY id", (uid,)
    ).fetchall()
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
    uid = g.user_id
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO monthly_entries (user_id, annee, mois, salaire) VALUES (?,?,?,?) "
        "ON CONFLICT(user_id, annee, mois) DO UPDATE SET salaire=excluded.salaire",
        (uid, annee, mois, salaire),
    )
    c.execute(
        "INSERT INTO repartition (user_id, annee, mois, pea, livret_a, cto, crypto) VALUES (?,?,?,?,?,?,?) "
        "ON CONFLICT(user_id, annee, mois) DO UPDATE SET pea=excluded.pea, livret_a=excluded.livret_a, "
        "cto=excluded.cto, crypto=excluded.crypto",
        (uid, annee, mois, rep["pea"], rep["livret_a"], rep["cto"], rep["crypto"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/month/<int:annee>/<int:mois>", methods=["DELETE"])
@login_required
def delete_month(annee, mois):
    uid = g.user_id
    conn = get_db()
    conn.execute("DELETE FROM monthly_entries WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois))
    conn.execute("DELETE FROM repartition WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois))
    conn.execute("DELETE FROM placements WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── PRÉLÈVEMENTS AUTO ──────────────────────────────────────────────────────────

@app.route("/api/prelevements", methods=["GET"])
@login_required
def get_prelevements():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM prelevements_auto WHERE user_id=? ORDER BY id", (g.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/prelevements", methods=["POST"])
@login_required
def save_prelevement():
    data = request.json
    uid = g.user_id
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE prelevements_auto SET libelle=?, banque=?, montant=?, mois_specifique=? "
            "WHERE id=? AND user_id=?",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique"), data["id"], uid),
        )
    else:
        conn.execute(
            "INSERT INTO prelevements_auto (user_id, libelle, banque, montant, mois_specifique) VALUES (?,?,?,?,?)",
            (uid, data["libelle"], data["banque"], data["montant"], data.get("mois_specifique")),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/prelevements/<int:pid>", methods=["DELETE"])
@login_required
def delete_prelevement(pid):
    conn = get_db()
    conn.execute("DELETE FROM prelevements_auto WHERE id=? AND user_id=?", (pid, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── VIREMENTS FIXES ────────────────────────────────────────────────────────────

@app.route("/api/virements-fixes", methods=["GET"])
@login_required
def get_virements_fixes():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM virements_fixes WHERE user_id=? ORDER BY id", (g.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/virements-fixes", methods=["POST"])
@login_required
def save_virement_fixe():
    data = request.json
    uid = g.user_id
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE virements_fixes SET libelle=?, banque=?, montant=? WHERE id=? AND user_id=?",
            (data["libelle"], data["banque"], data["montant"], data["id"], uid),
        )
    else:
        conn.execute(
            "INSERT INTO virements_fixes (user_id, libelle, banque, montant) VALUES (?,?,?,?)",
            (uid, data["libelle"], data["banque"], data["montant"]),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/virements-fixes/<int:vid>", methods=["DELETE"])
@login_required
def delete_virement_fixe(vid):
    conn = get_db()
    conn.execute("DELETE FROM virements_fixes WHERE id=? AND user_id=?", (vid, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── VIREMENTS COMPTES JOINTS ──────────────────────────────────────────────────

@app.route("/api/virements-cj", methods=["GET"])
@login_required
def get_virements_cj():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM virements_cj WHERE user_id=? ORDER BY id", (g.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/virements-cj", methods=["POST"])
@login_required
def save_virement_cj():
    data = request.json
    uid = g.user_id
    conn = get_db()
    if data.get("id"):
        conn.execute(
            "UPDATE virements_cj SET libelle=?, banque=?, montant=?, mois_specifique=? "
            "WHERE id=? AND user_id=?",
            (data["libelle"], data["banque"], data["montant"], data.get("mois_specifique"), data["id"], uid),
        )
    else:
        conn.execute(
            "INSERT INTO virements_cj (user_id, libelle, banque, montant, mois_specifique) VALUES (?,?,?,?,?)",
            (uid, data["libelle"], data["banque"], data["montant"], data.get("mois_specifique")),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/virements-cj/<int:cid>", methods=["DELETE"])
@login_required
def delete_virement_cj(cid):
    conn = get_db()
    conn.execute("DELETE FROM virements_cj WHERE id=? AND user_id=?", (cid, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── SUPPORTS ───────────────────────────────────────────────────────────────────

@app.route("/api/supports", methods=["GET"])
@login_required
def get_supports():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM supports WHERE user_id=? ORDER BY categorie, id", (g.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/supports", methods=["POST"])
@login_required
def add_support():
    data = request.json
    conn = get_db()
    conn.execute(
        "INSERT INTO supports (user_id, nom, categorie) VALUES (?,?,?)",
        (g.user_id, data["nom"], data["categorie"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/supports/<int:sid>", methods=["DELETE"])
@login_required
def delete_support(sid):
    conn = get_db()
    conn.execute("DELETE FROM supports WHERE id=? AND user_id=?", (sid, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── PLACEMENTS ─────────────────────────────────────────────────────────────────

@app.route("/api/placements", methods=["GET"])
@login_required
def get_placements():
    annee = request.args.get("annee", type=int)
    mois = request.args.get("mois", type=int)
    uid = g.user_id
    conn = get_db()
    supports = conn.execute(
        "SELECT * FROM supports WHERE user_id=? ORDER BY categorie, id", (uid,)
    ).fetchall()
    rows = conn.execute(
        "SELECT * FROM placements WHERE user_id=? AND annee=? AND mois=?", (uid, annee, mois)
    ).fetchall()
    prev_annee, prev_mois = (annee - 1, 12) if mois == 1 else (annee, mois - 1)
    prev_rows = conn.execute(
        "SELECT support, montant FROM placements WHERE user_id=? AND annee=? AND mois=?",
        (uid, prev_annee, prev_mois),
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
    uid = g.user_id
    conn = get_db()
    for item in data["placements"]:
        conn.execute(
            "INSERT INTO placements (user_id, annee, mois, support, categorie, montant) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(user_id, annee, mois, support) DO UPDATE SET montant=excluded.montant",
            (uid, annee, mois, item["support"], item["categorie"], item["montant"]),
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
        WHERE p.user_id=?
        GROUP BY p.annee, p.mois
        HAVING SUM(p.montant) > 0
        ORDER BY p.annee, p.mois
    """, (g.user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ── GRAPHES ────────────────────────────────────────────────────────────────────

@app.route("/api/graphes/evolution", methods=["GET"])
@login_required
def get_graphes_evolution():
    uid = g.user_id
    conn = get_db()
    rows = conn.execute("""
        SELECT annee, mois, support, categorie, montant
        FROM placements WHERE user_id=? AND montant > 0
        ORDER BY annee, mois, categorie, support
    """, (uid,)).fetchall()
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


def _categorize(supplier, label, category_parent, conn, user_id):
    if supplier:
        row = conn.execute(
            "SELECT category FROM supplier_categories WHERE user_id=? AND supplier=?",
            (user_id, supplier.lower().strip()),
        ).fetchone()
        if row:
            return row["category"]

    text = ((label or "") + " " + (supplier or "")).lower()
    rules = conn.execute(
        "SELECT keyword, category FROM categorization_rules WHERE user_id=? ORDER BY id",
        (user_id,),
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
    uid = g.user_id

    today = date.today()
    m = today.month - months
    y = today.year
    while m <= 0:
        m += 12
        y -= 1
    start = f"{y}-{m:02d}-01"

    conn = get_db()

    placeholders = ",".join("?" * len(EXCLUDED_FROM_REPORT))
    base_params = [uid, account_type, start] + list(EXCLUDED_FROM_REPORT)

    by_cat = conn.execute(f"""
        SELECT COALESCE(my_category, 'Non catégorisé') as cat,
               ABS(SUM(amount)) as total, COUNT(*) as cnt
        FROM transactions
        WHERE user_id=? AND account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY cat ORDER BY total DESC
    """, base_params).fetchall()

    monthly = conn.execute(f"""
        SELECT substr(date_op, 1, 7) as month, ABS(SUM(amount)) as total
        FROM transactions
        WHERE user_id=? AND account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY month ORDER BY month
    """, base_params).fetchall()

    monthly_by_cat = conn.execute(f"""
        SELECT substr(date_op, 1, 7) as month,
               COALESCE(my_category, 'Non catégorisé') as cat,
               ABS(SUM(amount)) as total
        FROM transactions
        WHERE user_id=? AND account_type=? AND amount < 0 AND date_op >= ?
          AND COALESCE(my_category, '') NOT IN ({placeholders})
        GROUP BY month, cat ORDER BY month, total DESC
    """, base_params).fetchall()

    conn.close()

    mois_abbr = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    all_months = sorted({r["month"] for r in monthly_by_cat})
    labels = [f"{mois_abbr[int(mo.split('-')[1])]} {mo.split('-')[0][2:]}" for mo in all_months]

    grand_total = sum(r["total"] for r in by_cat) or 1
    by_cat_list = [
        {"category": r["cat"], "total": round(r["total"], 2),
         "count": r["cnt"], "pct": round(r["total"] / grand_total * 100, 1)}
        for r in by_cat
    ]

    TOP_N = 7
    top_cats = [r["category"] for r in by_cat_list[:TOP_N]]
    cat_data = {cat: [0.0] * len(all_months) for cat in top_cats}
    autres_data = [0.0] * len(all_months)
    month_idx = {mo: i for i, mo in enumerate(all_months)}
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
    uid = g.user_id
    conn = get_db()
    if annee and mois:
        prefix = f"{annee}-{mois:02d}"
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date_op LIKE ? AND account_type=? "
            "ORDER BY date_op DESC, id DESC",
            (uid, f"{prefix}%", account_type),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND account_type=? "
            "ORDER BY date_op DESC, id DESC LIMIT 500",
            (uid, account_type),
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
    uid = g.user_id

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
            my_cat = _categorize(supplier, label, cat_parent, conn, uid)
            result = conn.execute(
                "INSERT OR IGNORE INTO transactions "
                "(user_id, date_op, date_val, label, category, category_parent, supplier, amount, "
                "comment, account_num, account_label, account_balance, my_category, account_type) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    uid,
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
    conn.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (tid, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/transactions/<int:tid>/category", methods=["PATCH"])
@login_required
def update_transaction_category(tid):
    data = request.json
    category = data.get("category")
    uid = g.user_id
    conn = get_db()
    conn.execute(
        "UPDATE transactions SET my_category=? WHERE id=? AND user_id=?", (category, tid, uid)
    )
    tx = conn.execute(
        "SELECT supplier FROM transactions WHERE id=? AND user_id=?", (tid, uid)
    ).fetchone()
    if tx and tx["supplier"]:
        conn.execute(
            "INSERT OR REPLACE INTO supplier_categories (user_id, supplier, category) VALUES (?,?,?)",
            (uid, tx["supplier"].lower().strip(), category),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/transactions/recategorize", methods=["POST"])
@login_required
def recategorize_all():
    uid = g.user_id
    conn = get_db()
    txs = conn.execute(
        "SELECT id, supplier, label, category_parent FROM transactions WHERE user_id=?", (uid,)
    ).fetchall()
    for tx in txs:
        cat = _categorize(tx["supplier"], tx["label"], tx["category_parent"], conn, uid)
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
    rows = conn.execute(
        "SELECT * FROM categorization_rules WHERE user_id=? ORDER BY id", (g.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/categorization-rules", methods=["POST"])
@login_required
def add_rule():
    data = request.json
    uid = g.user_id
    conn = get_db()
    conn.execute(
        "INSERT INTO categorization_rules (user_id, keyword, category) VALUES (?,?,?) "
        "ON CONFLICT(user_id, keyword) DO UPDATE SET category=excluded.category",
        (uid, data["keyword"].lower().strip(), data["category"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/categorization-rules/<int:rid>", methods=["DELETE"])
@login_required
def delete_rule(rid):
    conn = get_db()
    conn.execute(
        "DELETE FROM categorization_rules WHERE id=? AND user_id=?", (rid, g.user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── EXPORT / IMPORT ────────────────────────────────────────────────────────────

@app.route("/api/export", methods=["GET"])
@login_required
def export_data():
    uid = g.user_id
    conn = get_db()
    data = {
        "monthly_entries": [dict(r) for r in conn.execute(
            "SELECT * FROM monthly_entries WHERE user_id=? ORDER BY annee, mois", (uid,)
        ).fetchall()],
        "repartition": [dict(r) for r in conn.execute(
            "SELECT * FROM repartition WHERE user_id=? ORDER BY annee, mois", (uid,)
        ).fetchall()],
        "virements_fixes": [dict(r) for r in conn.execute(
            "SELECT * FROM virements_fixes WHERE user_id=? ORDER BY id", (uid,)
        ).fetchall()],
        "prelevements_auto": [dict(r) for r in conn.execute(
            "SELECT * FROM prelevements_auto WHERE user_id=? ORDER BY id", (uid,)
        ).fetchall()],
        "virements_cj": [dict(r) for r in conn.execute(
            "SELECT * FROM virements_cj WHERE user_id=? ORDER BY id", (uid,)
        ).fetchall()],
        "supports": [dict(r) for r in conn.execute(
            "SELECT * FROM supports WHERE user_id=? ORDER BY id", (uid,)
        ).fetchall()],
        "placements": [dict(r) for r in conn.execute(
            "SELECT * FROM placements WHERE user_id=? ORDER BY annee, mois, support", (uid,)
        ).fetchall()],
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
    uid = g.user_id
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
        c.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))
        for row in data[table]:
            vals = [uid] + [row.get(col) for col in cols]
            col_list = "user_id," + ",".join(cols)
            placeholders = ",".join(["?"] * (len(cols) + 1))
            c.execute(f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({placeholders})", vals)

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
