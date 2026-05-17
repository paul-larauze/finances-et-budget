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


def init_db():
    conn = get_db()
    c = conn.cursor()

    # ── USERS & INVITATIONS (new tables) ────────────────────────────────────────
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

    # ── MIGRATION: add user_id to all data tables if needed ─────────────────────
    if _table_exists(c, "monthly_entries") and not _table_has_column(c, "monthly_entries", "user_id"):
        _run_multiuser_migration(conn, c)

    # ── DATA TABLES (no-op if already exist) ────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        nom TEXT NOT NULL UNIQUE
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

    # Indexes on user_id for all per-user tables
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
    """)

    c.execute("SELECT COUNT(*) FROM categories")
    if c.fetchone()[0] == 0:
        cats = [
            "Alimentation", "Restaurants", "Transport", "Auto/Moto", "Logement",
            "Maison", "Santé", "Abonnements", "Loisirs", "Shopping", "Habillement",
            "Épargne", "Revenus", "Virements internes", "Virements",
            "Impôts & Charges", "Éducation", "Divers",
        ]
        c.executemany("INSERT INTO categories (nom) VALUES (?)", [(n,) for n in cats])

    c.execute("INSERT OR IGNORE INTO categories (nom) VALUES ('Éducation')")

    conn.commit()
    conn.close()


DEFAULT_RULES = [
    ("carrefour", "Alimentation"), ("leclerc", "Alimentation"),
    ("lidl", "Alimentation"), ("aldi", "Alimentation"),
    ("intermarche", "Alimentation"), ("monoprix", "Alimentation"),
    ("casino", "Alimentation"), ("franprix", "Alimentation"),
    ("super u", "Alimentation"), ("biocoop", "Alimentation"),
    ("picard", "Alimentation"), ("metro", "Alimentation"),
    ("edf", "Logement"), ("engie", "Logement"),
    ("loyer", "Logement"), ("veolia", "Logement"),
    ("eau", "Logement"), ("charges", "Logement"),
    ("syndic", "Logement"), ("assurance", "Logement"),
    ("orange", "Abonnements"), ("sfr", "Abonnements"),
    ("bouygues", "Abonnements"), ("free", "Abonnements"),
    ("netflix", "Abonnements"), ("spotify", "Abonnements"),
    ("amazon prime", "Abonnements"), ("disney", "Abonnements"),
    ("canal+", "Abonnements"), ("deezer", "Abonnements"),
    ("sncf", "Transport"), ("ratp", "Transport"),
    ("uber", "Transport"), ("blablacar", "Transport"),
    ("ouigo", "Transport"), ("transilien", "Transport"),
    ("total", "Auto/Moto"), ("bp ", "Auto/Moto"),
    ("shell", "Auto/Moto"), ("esso", "Auto/Moto"),
    ("pharmacie", "Santé"), ("cpam", "Santé"),
    ("medecin", "Santé"), ("hopital", "Santé"),
    ("laboratoire", "Santé"), ("dentiste", "Santé"),
    ("restaurant", "Restaurants"), ("mcdonald", "Restaurants"),
    ("burger king", "Restaurants"), ("pizza", "Restaurants"),
    ("kebab", "Restaurants"), ("brasserie", "Restaurants"),
    ("amazon", "Shopping"), ("cdiscount", "Shopping"),
    ("fnac", "Loisirs"), ("decathlon", "Loisirs"),
    ("cinema", "Loisirs"), ("theatre", "Loisirs"),
    ("leroy merlin", "Maison"), ("ikea", "Maison"),
    ("brico depot", "Maison"), ("castorama", "Maison"),
    ("urssaf", "Impôts & Charges"), ("impot", "Impôts & Charges"),
    ("tresor public", "Impôts & Charges"),
    ("zara", "Habillement"), ("h&m", "Habillement"),
    ("primark", "Habillement"), ("uniqlo", "Habillement"),
]

DEFAULT_SUPPORTS = [
    ("Bourso+", "livrets"), ("Livret A", "livrets"), ("LDDS", "livrets"),
    ("Livret Bourso", "livrets"), ("BforBank", "livrets"),
    ("Assurance vie Mahaut", "bourse"), ("Assurance vie Grégoire", "bourse"),
    ("Assurance vie Linxea", "bourse"), ("PEA Bourse Direct", "bourse"),
    ("CTO", "bourse"), ("Natixis", "bourse"), ("Coinbase", "bourse"),
]


def seed_new_user(conn, user_id):
    """Seeds default categorization rules and supports for a brand new user."""
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
    conn.commit()
