#!/usr/bin/env python3
"""Usage: check_glossary_corrections.py BEFORE_EXPORT SQL EXPECTED_CHANGES"""
import json,sqlite3,sys
from pathlib import Path
rows=json.loads(Path(sys.argv[1]).read_text())[0]['results']
sql=Path(sys.argv[2]).read_text();changes=json.loads(Path(sys.argv[3]).read_text())
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
cols=list(rows[0]);db.execute('CREATE TABLE glossary_terms ('+','.join(cols)+')')
for r in rows:db.execute('INSERT INTO glossary_terms VALUES ('+','.join('?' for _ in cols)+')',list(r.values()))
before={r['id']:r for r in rows};db.executescript(sql)
after={r['id']:dict(r) for r in db.execute('SELECT * FROM glossary_terms')}
assert len(before)==len(after)==335
assert {i for i in before if before[i]!=after[i]}=={int(i) for i in changes}
for i,r in after.items():
 for k,v in before[i].items():
  if k not in changes.get(str(i),{}) and k!='updated_at':assert r[k]==v,(i,k)
 for k,v in changes.get(str(i),{}).items():assert r[k]==v,(i,k)
db.executescript(sql);assert after=={r['id']:dict(r) for r in db.execute('SELECT * FROM glossary_terms')}
i=next(iter(changes));db.execute('UPDATE glossary_terms SET description_ko=? WHERE id=?',('concurrent edit',int(i)))
db.executescript(sql)
assert db.execute('SELECT description_ko FROM glossary_terms WHERE id=?',(int(i),)).fetchone()[0]=='concurrent edit'
print(f'PASS: 335 rows, exactly {len(changes)} corrections, other fields preserved, idempotence, concurrent-edit protection')
