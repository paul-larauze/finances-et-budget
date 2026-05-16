import sqlite3
import os

_data_dir = os.environ.get("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(_data_dir, "data.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS monthly_entries (
        id INTEGER PRIMARY KEY,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        salaire REAL DEFAULT 0,
        UNIQUE(annee, mois)
    );

    CREATE TABLE IF NOT EXISTS repartition (
        id INTEGER PRIMARY KEY,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        pea REAL DEFAULT 0,
        livret_a REAL DEFAULT 0,
        cto REAL DEFAULT 0,
        crypto REAL DEFAULT 0,
        UNIQUE(annee, mois)
    );

    CREATE TABLE IF NOT EXISTS virements_fixes (
        id INTEGER PRIMARY KEY,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prelevements_auto (
        id INTEGER PRIMARY KEY,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL,
        mois_specifique INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS virements_cj (
        id INTEGER PRIMARY KEY,
        libelle TEXT NOT NULL,
        banque TEXT,
        montant REAL NOT NULL,
        mois_specifique INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS supports (
        id INTEGER PRIMARY KEY,
        nom TEXT NOT NULL,
        categorie TEXT NOT NULL,
        UNIQUE(nom, categorie)
    );

    CREATE TABLE IF NOT EXISTS placements (
        id INTEGER PRIMARY KEY,
        annee INTEGER NOT NULL,
        mois INTEGER NOT NULL,
        support TEXT NOT NULL,
        categorie TEXT NOT NULL,
        montant REAL DEFAULT 0,
        UNIQUE(annee, mois, support)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
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
        UNIQUE(date_op, label, amount, account_num)
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        nom TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS categorization_rules (
        id INTEGER PRIMARY KEY,
        keyword TEXT NOT NULL,
        category TEXT NOT NULL,
        UNIQUE(keyword)
    );

    CREATE TABLE IF NOT EXISTS supplier_categories (
        supplier TEXT PRIMARY KEY,
        category TEXT NOT NULL
    );
    """)

    for migration in [
        "ALTER TABLE transactions ADD COLUMN my_category TEXT",
        "ALTER TABLE transactions ADD COLUMN account_type TEXT DEFAULT 'perso'",
    ]:
        try:
            c.execute(migration)
        except Exception:
            pass

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

    c.execute("SELECT COUNT(*) FROM categorization_rules")
    if c.fetchone()[0] == 0:
        rules = [
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
        c.executemany("INSERT OR IGNORE INTO categorization_rules (keyword, category) VALUES (?,?)", rules)

    c.execute("SELECT COUNT(*) FROM supports")
    if c.fetchone()[0] == 0:
        supports = [
            ("Bourso+", "livrets"), ("Livret A", "livrets"), ("LDDS", "livrets"),
            ("Livret Bourso", "livrets"), ("BforBank", "livrets"),
            ("Assurance vie Mahaut", "bourse"), ("Assurance vie Grégoire", "bourse"),
            ("Assurance vie Linxea", "bourse"), ("PEA Bourse Direct", "bourse"),
            ("CTO", "bourse"), ("Natixis", "bourse"), ("Coinbase", "bourse"),
        ]
        c.executemany("INSERT INTO supports (nom, categorie) VALUES (?,?)", supports)

    conn.commit()
    conn.close()
