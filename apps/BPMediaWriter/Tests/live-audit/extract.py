"""운영 기사 JSON 에서 '정답'(이미지 URL·텍스트 조각)을 독립적으로 뽑는다.
Swift 디코더와 대조하기 위한 것 — 같은 코드를 쓰지 않는 것이 요점이다."""
import json, glob, sys, os

def fragments(doc):
    out = []
    for b in doc.get('blocks', []):
        d = b.get('data') or {}
        if isinstance(d.get('text'), str):
            out.append(d['text'])
        items = d.get('items')
        if isinstance(items, list):
            for it in items:
                if isinstance(it, str):
                    out.append(it)
                elif isinstance(it, dict):
                    for k in ('content', 'text'):
                        if isinstance(it.get(k), str):
                            out.append(it[k])
                    for sub in (it.get('items') or []):
                        if isinstance(sub, str):
                            out.append(sub)
                        elif isinstance(sub, dict) and isinstance(sub.get('content'), str):
                            out.append(sub['content'])
        cont = d.get('content')
        if isinstance(cont, list):
            for row in cont:
                if isinstance(row, list):
                    for cell in row:
                        if isinstance(cell, str):
                            out.append(cell)
    return out

posts_dir = sys.argv[1]
out_dir = os.path.dirname(posts_dir.rstrip('/'))
truth, frag, types = {}, {}, {}
for f in sorted(glob.glob(posts_dir + '/*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    p = d.get('post', d)
    pid, c = p.get('id'), p.get('content')
    if not isinstance(c, str):
        continue
    if not c.strip().startswith('{'):
        truth[str(pid)] = {'json': False, 'images': []}
        continue
    try:
        doc = json.loads(c)
    except Exception:
        continue
    imgs = []
    for b in doc.get('blocks', []):
        t = b.get('type')
        types[t] = types.get(t, 0) + 1
        if t == 'image':
            u = (b.get('data') or {}).get('file', {})
            if isinstance(u, dict) and u.get('url'):
                imgs.append(u['url'])
    truth[str(pid)] = {'json': True, 'images': imgs}
    frag[str(pid)] = fragments(doc)

json.dump(truth, open(out_dir + '/truth.json', 'w'), ensure_ascii=False)
json.dump(frag, open(out_dir + '/fragments.json', 'w'), ensure_ascii=False)
print(f"기사 {len(truth)}건 · 텍스트 조각 {sum(len(v) for v in frag.values())}개")
print("블록 분포:", ' · '.join(f"{k} {v}" for k, v in sorted(types.items(), key=lambda x: -x[1])))
