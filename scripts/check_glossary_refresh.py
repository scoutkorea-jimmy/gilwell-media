#!/usr/bin/env python3
"""Check refresh against a Wrangler JSON export and /api/settings/wosm-members JSON.
Usage: python3 scripts/check_glossary_refresh.py SQL DB_EXPORT MEMBERS_JSON
"""
import json, sqlite3, sys
from pathlib import Path
sql = Path(sys.argv[1]).read_text()
old = json.loads(Path(sys.argv[2]).read_text())[0]['results']
members = json.loads(Path(sys.argv[3]).read_text())['items']

def seeded():
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE glossary_terms(id INTEGER PRIMARY KEY AUTOINCREMENT,bucket TEXT CHECK(bucket IN ('가','나','다','라','마','바','사','아','자','차','카','타','파','하')),term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    for row in old:
        db.execute('INSERT INTO glossary_terms (' + ','.join(row) + ') VALUES (' + ','.join('?' for _ in row) + ')', list(row.values()))
    return db

db = seeded()
db.executescript(sql)
actual = {r['id']: dict(r) for r in db.execute('SELECT * FROM glossary_terms')}
assert len(actual) == 335
for r in old:
    assert all(actual[r['id']][k] == r[k] for k in ['id', 'created_at', 'term_fr'])
for m in members:
    name = 'Scouting America' if m['country_en'] == 'United States of America' else m['status_description']
    assert db.execute('SELECT COUNT(*) FROM glossary_terms WHERE term_en=?', (name,)).fetchone()[0] == 1, name
before = [tuple(r) for r in db.execute('SELECT * FROM glossary_terms ORDER BY id')]
db.executescript(sql)
assert before == [tuple(r) for r in db.execute('SELECT * FROM glossary_terms ORDER BY id')]
concurrent = seeded()
concurrent.execute("UPDATE glossary_terms SET description_ko='concurrent edit' WHERE id=1")
concurrent.executescript(sql)
assert concurrent.execute('SELECT description_ko FROM glossary_terms WHERE id=1').fetchone()[0] == 'concurrent edit'
print('PASS: 335 terms, full organisation coverage, identity/translations preserved, idempotence, concurrent-edit guard')
