#!/usr/bin/env node
/**
 * audit_thin_content.mjs — 얇은 콘텐츠 일괄 점검 도구
 *
 * Google "부가가치 없는 빈약한 콘텐츠" 수동 조치 대응용 triage 리포트.
 * 공개글의 Editor.js 본문에서 실제 텍스트만 추출해 길이를 측정하고,
 * thin(짧음) · AI 보조 · 통합/보강 후보를 분류해 출력한다.
 *
 * 사용:
 *   node scripts/audit_thin_content.mjs                 # 기본 임계 800자
 *   node scripts/audit_thin_content.mjs --min 1000      # 임계 변경
 *   node scripts/audit_thin_content.mjs --csv > out.csv # CSV 출력
 *   node scripts/audit_thin_content.mjs --local         # 로컬 D1 (기본: --remote)
 *
 * 환경: PATH 에 wrangler 필요 (export PATH="/opt/homebrew/bin:$PATH")
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const MIN = Number((args[args.indexOf('--min') + 1]) || 0) || 800;
const AS_CSV = args.includes('--csv');
const TARGET = args.includes('--local') ? '--local' : '--remote';
const DB = 'gilwell-posts';

function query(sql) {
  const out = execFileSync(
    'wrangler',
    ['d1', 'execute', DB, TARGET, '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  // wrangler 가 stdout 앞에 경고를 섞을 수 있어 첫 '[' 부터 파싱
  const start = out.indexOf('[');
  const parsed = JSON.parse(out.slice(start));
  return parsed[0].results || [];
}

/** Editor.js JSON(또는 raw html) 에서 표시 텍스트만 추출 */
function realText(content) {
  if (!content) return '';
  let text = '';
  try {
    const obj = JSON.parse(content);
    if (Array.isArray(obj.blocks)) {
      text = obj.blocks
        .map((b) => {
          const d = b && b.data ? b.data : {};
          if (typeof d.text === 'string') return d.text;
          if (Array.isArray(d.items)) return d.items.map((it) => (typeof it === 'string' ? it : (it && it.content) || '')).join(' ');
          if (typeof d.caption === 'string') return d.caption;
          return '';
        })
        .join(' ');
    }
  } catch {
    text = content;
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

const rows = query(
  `SELECT id, category, title, ai_assisted, LENGTH(content) raw_len, content
     FROM posts WHERE published = 1`
);

const audited = rows
  .map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title || '',
    ai: r.ai_assisted ? 1 : 0,
    len: realText(r.content).length,
  }))
  .sort((a, b) => a.len - b.len);

if (AS_CSV) {
  console.log('id,category,len,ai_assisted,flag,title');
  for (const p of audited) {
    const flag = p.len < MIN * 0.6 ? 'CRITICAL' : p.len < MIN ? 'THIN' : 'OK';
    const safeTitle = '"' + p.title.replace(/"/g, '""') + '"';
    console.log(`${p.id},${p.category},${p.len},${p.ai},${flag},${safeTitle}`);
  }
  process.exit(0);
}

const critical = audited.filter((p) => p.len < MIN * 0.6);
const thin = audited.filter((p) => p.len >= MIN * 0.6 && p.len < MIN);
const ok = audited.filter((p) => p.len >= MIN);
const aiCount = audited.filter((p) => p.ai).length;

const byCat = {};
for (const p of audited.filter((x) => x.len < MIN)) {
  byCat[p.category] = (byCat[p.category] || 0) + 1;
}

console.log(`\n📊 얇은 콘텐츠 점검 (공개글 ${audited.length}건 · 임계 ${MIN}자 · ${TARGET})`);
console.log('─'.repeat(64));
console.log(`  AI 보조 작성        : ${aiCount} / ${audited.length} (${Math.round((aiCount / audited.length) * 100)}%)`);
console.log(`  🔴 CRITICAL (<${Math.round(MIN * 0.6)}자) : ${critical.length}건 — 통합/삭제/대폭 보강 1순위`);
console.log(`  🟡 THIN (${Math.round(MIN * 0.6)}–${MIN}자)   : ${thin.length}건 — 출처·해설 보강 대상`);
console.log(`  ✅ OK (${MIN}자+)        : ${ok.length}건`);
console.log(`\n  thin 카테고리 분포: ${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(' · ') || '없음'}`);

const worst = audited.filter((p) => p.len < MIN).slice(0, 30);
console.log(`\n🔎 보강/통합 후보 TOP ${worst.length} (얇은 순)`);
console.log('─'.repeat(64));
for (const p of worst) {
  const mark = p.len < MIN * 0.6 ? '🔴' : '🟡';
  console.log(`  ${mark} [${String(p.len).padStart(4)}자] /${p.category} #${p.id}  ${p.title.slice(0, 44)}`);
}
console.log(`\n💡 권장: 🔴 는 묶어서 큐레이션 기사화하거나 noindex, 🟡 는 1차 출처 링크 + 한국 관점 해설 단락 추가.`);
console.log(`   CSV 내보내기: node scripts/audit_thin_content.mjs --csv > thin-audit.csv\n`);
