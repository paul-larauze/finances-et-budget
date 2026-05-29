import sqlite3
import os

_data_dir = os.environ.get("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(_data_dir, "data.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _table_has_column(c, table, column):
    cols = [row[1] for row in c.execute(f"PRAGMA table_info({table})").fetchall()]
    return column in cols


def _table_exists(c, table):
    return c.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _run_multiuser_migration(conn, c):
    """Recreates data tables to add user_id and update UNIQUE constraints."""
    migrations = [
        ("monthly_entries",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "annee INTEGER NOT NULL, mois INTEGER NOT NULL, salaire REAL DEFAULT 0, "
         "UNIQUE(user_id, annee, mois)",
         "id, 1, annee, mois, salaire"),
        ("repartition",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "annee INTEGER NOT NULL, mois INTEGER NOT NULL, "
         "pea REAL DEFAULT 0, livret_a REAL DEFAULT 0, cto REAL DEFAULT 0, crypto REAL DEFAULT 0, "
         "UNIQUE(user_id, annee, mois)",
         "id, 1, annee, mois, pea, livret_a, cto, crypto"),
        ("virements_fixes",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "libelle TEXT NOT NULL, banque TEXT, montant REAL NOT NULL",
         "id, 1, libelle, banque, montant"),
        ("prelevements_auto",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "libelle TEXT NOT NULL, banque TEXT, montant REAL NOT NULL, mois_specifique INTEGER DEFAULT NULL",
         "id, 1, libelle, banque, montant, mois_specifique"),
        ("virements_cj",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "libelle TEXT NOT NULL, banque TEXT, montant REAL NOT NULL, mois_specifique INTEGER DEFAULT NULL",
         "id, 1, libelle, banque, montant, mois_specifique"),
        ("supports",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "nom TEXT NOT NULL, categorie TEXT NOT NULL, "
         "UNIQUE(user_id, nom, categorie)",
         "id, 1, nom, categorie"),
        ("placements",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "annee INTEGER NOT NULL, mois INTEGER NOT NULL, "
         "support TEXT NOT NULL, categorie TEXT NOT NULL, montant REAL DEFAULT 0, "
         "UNIQUE(user_id, annee, mois, support)",
         "id, 1, annee, mois, support, categorie, montant"),
        ("transactions",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "date_op TEXT NOT NULL, date_val TEXT NOT NULL, label TEXT NOT NULL, "
         "category TEXT, category_parent TEXT, supplier TEXT, amount REAL NOT NULL, "
         "comment TEXT, account_num TEXT, account_label TEXT, account_balance REAL, "
         "my_category TEXT, account_type TEXT DEFAULT 'perso', "
         "UNIQUE(user_id, date_op, label, amount, account_num)",
         "id, 1, date_op, date_val, label, category, category_parent, supplier, amount, "
         "comment, account_num, account_label, account_balance, my_category, account_type"),
        ("categorization_rules",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "keyword TEXT NOT NULL, category TEXT NOT NULL, "
         "UNIQUE(user_id, keyword)",
         "id, 1, keyword, category"),
        ("supplier_categories",
         "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, "
         "supplier TEXT NOT NULL, category TEXT NOT NULL, "
         "UNIQUE(user_id, supplier)",
         "NULL, 1, supplier, category"),
    ]

    for table, schema, copy_cols in migrations:
        if not _table_exists(c, table):
            continue
        c.execute(f"ALTER TABLE {table} RENAME TO _{table}_old")
        c.execute(f"CREATE TABLE {table} ({schema})")
        c.execute(f"INSERT INTO {table} SELECT {copy_cols} FROM _{table}_old")
        c.execute(f"DROP TABLE _{table}_old")

    conn.commit()


# ── DEFAULT CATEGORY HIERARCHY ─────────────────────────────────────────────────
# (parent_nom, position, [(subcat_nom, position), ...])
DEFAULT_CATEGORIES = [
    ("Revenus", 0, [
        ("Salaires", 0),
        ("CAF", 1),
    ]),
    ("Alimentation", 1, [
        ("Alimentation", 0),
    ]),
    ("Loisirs", 2, [
        ("Shopping", 0),
        ("Habillement", 1),
        ("Restaurants", 2),
        ("Maison", 3),
        ("Vacances", 4),
        ("Essence", 5),
        ("Voiture", 6),
    ]),
    ("Frais récurrents", 3, [
        ("Abonnements", 0),
        ("Assurances", 1),
    ]),
    ("Frais standards", 4, [
        ("Éducation", 0),
        ("Santé", 1),
    ]),
    ("Non Classé", 5, []),
]


def _seed_categories_for_user(c, user_id):
    c.execute("SELECT COUNT(*) FROM categories WHERE user_id=?", (user_id,))
    if c.fetchone()[0] > 0:
        return
    for cat_nom, cat_pos, subcats in DEFAULT_CATEGORIES:
        c.execute(
            "INSERT INTO categories (user_id, parent_id, nom, position) VALUES (?,?,?,?)",
            (user_id, None, cat_nom, cat_pos),
        )
        parent_id = c.lastrowid
        for sub_nom, sub_pos in subcats:
            c.execute(
                "INSERT INTO categories (user_id, parent_id, nom, position) VALUES (?,?,?,?)",
                (user_id, parent_id, sub_nom, sub_pos),
            )


def _migrate_to_categories_v2(conn, c):
    """Replaces the old flat categories table with the new hierarchical one."""
    if _table_has_column(c, "categories", "parent_id"):
        return  # already migrated

    c.execute("DROP TABLE IF EXISTS categories")
    c.execute("""
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 1,
            parent_id INTEGER DEFAULT NULL,
            nom TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_categories_uid ON categories(user_id)")

    # Seed for all existing users; if no users yet, first registration will seed
    for row in c.execute("SELECT id FROM users").fetchall():
        _seed_categories_for_user(c, row[0])

    conn.commit()


def init_db():
    conn = get_db()
    c = conn.cursor()

    # ── USERS & INVITATIONS ──────────────────────────────────────────────────────
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invitation_tokens (
        token TEXT PRIMARY KEY,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT,
        used_by INTEGER
    );
    """)

    # ── MIGRATION: multi-user ────────────────────────────────────────────────────
    if _table_exists(c, "monthly_entries") and not _table_has_column(c, "monthly_entries", "user_id"):
        _run_multiuser_migration(conn, c)

    # ── DATA TABLES ──────────────────────────────────────────────────────────────
    c.executescript("""
    CREATE TABLE IF NOT EXISTS monthly_entries (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        salaire REAL DEFAULT 0,
        UNIQUE(user_id, annee, mois)
    );

    CREATE TABLE IF NOT EXISTS repartition (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        pea REAL DEFAULT 0,
        livret_a REAL DEFAULT 0,
        cto REAL DEFAULT 0,
        crypto REAL DEFAULT 0,
        UNIQUE(user_id, annee, mois)
    );

    CREATE TABLE IF NOT EXISTS virements_fixes (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prelevements_auto (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL,
        mois_specifique INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS virements_cj (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL,
        mois_specifique INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS supports (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        nom TEXT NOT NULL,
        categorie TEXT NOT NULL,
        UNIQUE(user_id, nom, categorie)
    );

    CREATE TABLE IF NOT EXISTS placements (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        support TEXT NOT NULL,
        categorie TEXT NOT NULL,
        montant REAL DEFAULT 0,
        UNIQUE(user_id, annee, mois, support)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        date_op TEXT NOT NULL,
        date_val TEXT NOT NULL,
        label TEXT NOT NULL,
        category TEXT,
        category_parent TEXT,
        supplier TEXT,
        amount REAL NOT NULL,
        comment TEXT,
        account_num TEXT,
        account_label TEXT,
        account_balance REAL,
        my_category TEXT,
        account_type TEXT DEFAULT 'perso',
        UNIQUE(user_id, date_op, label, amount, account_num)
    );

    CREATE TABLE IF NOT EXISTS categorization_rules (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        keyword TEXT NOT NULL,
        category TEXT NOT NULL,
        UNIQUE(user_id, keyword)
    );

    CREATE TABLE IF NOT EXISTS supplier_categories (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        supplier TEXT NOT NULL,
        category TEXT NOT NULL,
        UNIQUE(user_id, supplier)
    );
    """)

    # ── MIGRATION: account_tabs ──────────────────────────────────────────────────
    if not _table_exists(c, "account_tabs"):
        c.execute("""
            CREATE TABLE account_tabs (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                account_type TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                UNIQUE(user_id, account_type)
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_account_tabs_uid ON account_tabs(user_id)")
        # Seed existing users
        for row in c.execute("SELECT id FROM users").fetchall():
            _seed_account_tabs_for_user(c, row[0])
        conn.commit()

    # ── MIGRATION: categories v2 (hierarchical, per-user) ───────────────────────
    if _table_exists(c, "categories"):
        _migrate_to_categories_v2(conn, c)

    c.executescript("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        parent_id INTEGER DEFAULT NULL,
        nom TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
    );
    """)

    # ── INDEXES ──────────────────────────────────────────────────────────────────
    c.executescript("""
    CREATE INDEX IF NOT EXISTS idx_monthly_entries_uid    ON monthly_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_repartition_uid        ON repartition(user_id);
    CREATE INDEX IF NOT EXISTS idx_virements_fixes_uid    ON virements_fixes(user_id);
    CREATE INDEX IF NOT EXISTS idx_prelevements_auto_uid  ON prelevements_auto(user_id);
    CREATE INDEX IF NOT EXISTS idx_virements_cj_uid       ON virements_cj(user_id);
    CREATE INDEX IF NOT EXISTS idx_supports_uid           ON supports(user_id);
    CREATE INDEX IF NOT EXISTS idx_placements_uid         ON placements(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_uid       ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_cat_rules_uid          ON categorization_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_cat_uid       ON supplier_categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_uid         ON categories(user_id);
    """)

    conn.commit()
    conn.close()


# ── DEFAULT SEEDS ─────────────────────────────────────────────────────────────

DEFAULT_RULES = [
    # Alimentation
    ("carrefour", "Alimentation"), ("leclerc", "Alimentation"),
    ("lidl", "Alimentation"), ("aldi", "Alimentation"),
    ("intermarche", "Alimentation"), ("monoprix", "Alimentation"),
    ("casino", "Alimentation"), ("franprix", "Alimentation"),
    ("super u", "Alimentation"), ("biocoop", "Alimentation"),
    ("picard", "Alimentation"), ("metro", "Alimentation"),
    # Restaurants
    ("restaurant", "Restaurants"), ("mcdonald", "Restaurants"),
    ("burger king", "Restaurants"), ("pizza", "Restaurants"),
    ("kebab", "Restaurants"), ("brasserie", "Restaurants"),
    # Shopping
    ("amazon", "Shopping"), ("cdiscount", "Shopping"),
    ("fnac", "Shopping"), ("decathlon", "Shopping"),
    ("cinema", "Shopping"), ("theatre", "Shopping"),
    # Habillement
    ("zara", "Habillement"), ("h&m", "Habillement"),
    ("primark", "Habillement"), ("uniqlo", "Habillement"),
    # Maison
    ("leroy merlin", "Maison"), ("ikea", "Maison"),
    ("brico depot", "Maison"), ("castorama", "Maison"),
    # Essence
    ("total", "Essence"), ("bp ", "Essence"),
    ("shell", "Essence"), ("esso", "Essence"),
    # Voiture / transport
    ("sncf", "Voiture"), ("ratp", "Voiture"),
    ("uber", "Voiture"), ("blablacar", "Voiture"),
    ("ouigo", "Voiture"), ("transilien", "Voiture"),
    # Abonnements
    ("orange", "Abonnements"), ("sfr", "Abonnements"),
    ("bouygues", "Abonnements"), ("free", "Abonnements"),
    ("netflix", "Abonnements"), ("spotify", "Abonnements"),
    ("amazon prime", "Abonnements"), ("disney", "Abonnements"),
    ("canal+", "Abonnements"), ("deezer", "Abonnements"),
    # Assurances
    ("assurance", "Assurances"),
    # Santé
    ("pharmacie", "Santé"), ("cpam", "Santé"),
    ("medecin", "Santé"), ("hopital", "Santé"),
    ("laboratoire", "Santé"), ("dentiste", "Santé"),
    # Éducation
    ("ecole", "Éducation"), ("universite", "Éducation"),
    ("formation", "Éducation"),
    # Revenus
    ("caf", "CAF"),
]

DEFAULT_SUPPORTS = [
    ("Bourso+", "livrets"), ("Livret A", "livrets"), ("LDDS", "livrets"),
    ("Livret Bourso", "livrets"), ("BforBank", "livrets"),
    ("Assurance vie Mahaut", "bourse"), ("Assurance vie Grégoire", "bourse"),
    ("Assurance vie Linxea", "bourse"), ("PEA Bourse Direct", "bourse"),
    ("CTO", "bourse"), ("Natixis", "bourse"), ("Coinbase", "bourse"),
]


DEFAULT_ACCOUNT_TABS = [
    ("Compte perso", "perso"),
    ("Compte joint", "joint"),
]


def _seed_account_tabs_for_user(c, user_id):
    c.execute("SELECT COUNT(*) FROM account_tabs WHERE user_id=?", (user_id,))
    if c.fetchone()[0] > 0:
        return
    for pos, (label, account_type) in enumerate(DEFAULT_ACCOUNT_TABS):
        c.execute(
            "INSERT OR IGNORE INTO account_tabs (user_id, label, account_type, position) VALUES (?,?,?,?)",
            (user_id, label, account_type, pos),
        )


def seed_new_user(conn, user_id):
    """Seeds default categorization rules, supports and categories for a new user."""
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM categorization_rules WHERE user_id=?", (user_id,))
    if c.fetchone()[0] == 0:
        c.executemany(
            "INSERT OR IGNORE INTO categorization_rules (user_id, keyword, category) VALUES (?,?,?)",
            [(user_id, k, v) for k, v in DEFAULT_RULES],
        )

    c.execute("SELECT COUNT(*) FROM supports WHERE user_id=?", (user_id,))
    if c.fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO supports (user_id, nom, categorie) VALUES (?,?,?)",
            [(user_id, nom, cat) for nom, cat in DEFAULT_SUPPORTS],
        )

    _seed_categories_for_user(c, user_id)
    _seed_account_tabs_for_user(c, user_id)

    conn.commit()
