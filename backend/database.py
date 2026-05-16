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
    """)

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
