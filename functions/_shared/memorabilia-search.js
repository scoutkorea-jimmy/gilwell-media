/**
 * Gilwell Media · Memorabilia 검색 인덱스 헬퍼
 *
 * D1 FTS5 + 한국어 자모/초성 정규화.
 *
 * 호출 위치:
 *   · 도감 항목 생성/수정 시  → upsertMemorabiliaFtsRow()
 *   · 항목 삭제 시            → deleteMemorabiliaFtsRow()
 *   · 검색 요청 시            → buildSearchQuery() 로 FTS5 MATCH 구문 생성
 *   · 자동완성 시             → composeAutocompletePool() 로 동의어 풀 확장
 */

import { COUNTRY_CODE_LABELS_KO } from './country-code-labels.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1) 한글 자모 분해 / 초성 추출
//    SQLite trigram 토크나이저는 CJK 음절을 1글자 단위로 자르지 못해서
//    "잼버리" 검색은 "잼", "버", "리" 셋의 trigram 매칭으로 처리된다.
//    부분 일치를 더 잘 잡으려면 자모 분해본을 추가 인덱스 컬럼으로 둔다.
//    초성 검색('ㅈㅂㄹ')은 한국 검색의 표준 UX 이므로 choseong 컬럼 별도.
// ─────────────────────────────────────────────────────────────────────────────

const HANGUL_SYLLABLE_BASE  = 0xac00;
const HANGUL_SYLLABLE_LAST  = 0xd7a3;
const CHOSEONG_COUNT        = 19;
const JUNGSEONG_COUNT       = 21;
const JONGSEONG_COUNT       = 28;

const CHOSEONG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];
const JUNGSEONG = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ',
  'ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
];
const JONGSEONG = [
  '', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ',
  'ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

export function decomposeJamo(input) {
  if (!input) return '';
  let out = '';
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_LAST) {
      const idx = code - HANGUL_SYLLABLE_BASE;
      const cho = Math.floor(idx / (JUNGSEONG_COUNT * JONGSEONG_COUNT));
      const jung = Math.floor((idx % (JUNGSEONG_COUNT * JONGSEONG_COUNT)) / JONGSEONG_COUNT);
      const jong = idx % JONGSEONG_COUNT;
      out += CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
    } else {
      out += str[i];
    }
  }
  return out;
}

export function extractChoseong(input) {
  if (!input) return '';
  let out = '';
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_LAST) {
      const idx = code - HANGUL_SYLLABLE_BASE;
      out += CHOSEONG[Math.floor(idx / (JUNGSEONG_COUNT * JONGSEONG_COUNT))];
    } else if (/[A-Za-z0-9]/.test(str[i])) {
      // 영문/숫자는 그대로 두어 혼합 검색을 허용
      out += str[i];
    } else {
      // 공백·구두점은 단어 경계로
      if (out && out[out.length - 1] !== ' ') out += ' ';
    }
  }
  return out.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Editor.js JSON → plaintext 추출
//    description 컬럼은 Editor.js JSON 그대로 저장하고, 검색용 plaintext 는
//    description_plain_* 컬럼에 별도 저장한다.
// ─────────────────────────────────────────────────────────────────────────────

export function extractEditorJsPlain(input) {
  if (!input) return '';
  let data;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return String(input);
  }
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const parts = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const d = block.data || {};
    // 텍스트 위주 블록
    if (typeof d.text === 'string')    parts.push(stripHtml(d.text));
    if (typeof d.caption === 'string') parts.push(stripHtml(d.caption));
    if (typeof d.title === 'string')   parts.push(d.title);
    if (Array.isArray(d.items)) {
      for (const it of d.items) {
        if (typeof it === 'string') parts.push(stripHtml(it));
        else if (it && typeof it.content === 'string') parts.push(stripHtml(it.content));
        else if (it && typeof it.text === 'string') parts.push(stripHtml(it.text));
      }
    }
    if (Array.isArray(d.content)) {
      for (const row of d.content) {
        if (Array.isArray(row)) parts.push(row.map(stripHtml).join(' '));
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) FTS row upsert / delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 도감 항목 1건의 검색 인덱스를 갱신한다.
 *
 * @param {D1Database} db
 * @param {object} item - 메인 row + 부수 데이터
 *   {
 *     id, title_en, title_ko, event_name_en, event_name_ko,
 *     issuer_en, issuer_ko, material_en, material_ko,
 *     description_plain_en, description_plain_ko,
 *     tags: [string, ...],
 *     country_codes: ['KR', 'JP', ...],
 *     category_label_en, category_label_ko,
 *   }
 */
export async function upsertMemorabiliaFtsRow(db, item) {
  // 1) 기존 row 삭제 (UNINDEXED 컬럼이라 ON CONFLICT REPLACE 불가, 명시적 delete)
  await db.prepare(`DELETE FROM memorabilia_fts WHERE memorabilia_id = ?`).bind(item.id).run();

  // 2) tags / country_names / category_label 텍스트 평탄화
  const tagsText = Array.isArray(item.tags) ? item.tags.join(' ') : '';
  const countryNamesText = (item.country_codes || [])
    .map((code) => `${code} ${COUNTRY_CODE_LABELS_KO[code] || ''}`.trim())
    .join(' ');
  const categoryLabelText = [item.category_label_en, item.category_label_ko].filter(Boolean).join(' ');

  // 3) jamo / choseong blob — 검색 가능한 모든 한국어 텍스트의 합집합
  const koreanBlob = [
    item.title_ko, item.event_name_ko, item.issuer_ko, item.material_ko,
    item.description_plain_ko, item.category_label_ko, tagsText,
  ].filter(Boolean).join(' ');

  const jamoBlob     = decomposeJamo(koreanBlob);
  const choseongBlob = extractChoseong(koreanBlob);

  // 4) FTS row insert
  await db.prepare(`
    INSERT INTO memorabilia_fts(
      title_en, title_ko,
      event_name_en, event_name_ko,
      issuer_en, issuer_ko,
      material_en, material_ko,
      description_plain_en, description_plain_ko,
      tags_text,
      country_names_text,
      category_label_text,
      jamo_blob,
      choseong_blob,
      memorabilia_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.title_en || '', item.title_ko || '',
    item.event_name_en || '', item.event_name_ko || '',
    item.issuer_en || '', item.issuer_ko || '',
    item.material_en || '', item.material_ko || '',
    item.description_plain_en || '', item.description_plain_ko || '',
    tagsText,
    countryNamesText,
    categoryLabelText,
    jamoBlob,
    choseongBlob,
    item.id,
  ).run();
}

export async function deleteMemorabiliaFtsRow(db, memorabiliaId) {
  await db.prepare(`DELETE FROM memorabilia_fts WHERE memorabilia_id = ?`).bind(memorabiliaId).run();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 검색 쿼리 빌더
//    사용자 입력을 안전한 FTS5 MATCH 구문으로 변환한다.
//    · 영문/숫자/한글 음절은 그대로 (trigram 매칭)
//    · 한글이 포함되면 자모 분해본도 OR 로 추가 (부분 일치 보강)
//    · 사용자가 입력한 토큰이 초성만으로 이루어졌으면 choseong 매칭으로 분기
// ─────────────────────────────────────────────────────────────────────────────

const CHOSEONG_ONLY_RE = /^[ㄱ-ㅎ\s]+$/;
const HAS_HANGUL_RE    = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// FTS5 reserved 문자 ( ) " * : - 등 — 안전을 위해 escape (큰따옴표로 감싼다)
function escapeFtsToken(token) {
  // FTS5 안에서 큰따옴표는 두 번 적어서 escape
  return `"${String(token).replace(/"/g, '""')}"`;
}

/**
 * @param {string} userQuery - raw 사용자 입력
 * @returns {string|null} - FTS5 MATCH 구문 (없으면 null)
 */
export function buildSearchQuery(userQuery) {
  if (!userQuery) return null;
  const trimmed = String(userQuery).trim();
  if (!trimmed) return null;

  // 토큰 분리: 공백 단위
  const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!tokens.length) return null;

  const clauses = [];
  for (const tok of tokens) {
    const variants = [];

    // 1) 원문 토큰 → 모든 텍스트 컬럼에서 매칭
    variants.push(escapeFtsToken(tok));

    // 2) 한글 포함이면 자모 분해 변형 → jamo_blob 컬럼 매칭
    if (HAS_HANGUL_RE.test(tok)) {
      const jamo = decomposeJamo(tok);
      if (jamo && jamo !== tok) {
        variants.push(`jamo_blob: ${escapeFtsToken(jamo)}`);
      }
    }

    // 3) 초성만으로 이루어진 토큰 → choseong_blob 매칭
    if (CHOSEONG_ONLY_RE.test(tok) && tok.replace(/\s+/g, '').length >= 2) {
      variants.push(`choseong_blob: ${escapeFtsToken(tok.replace(/\s+/g, ''))}`);
    }

    clauses.push(`(${variants.join(' OR ')})`);
  }
  return clauses.join(' AND ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Glossary 동의어 풀 — bpmedia.net/glossary 기반
//    검색 쿼리를 받으면 글로서리에서 alias 를 찾아 검색식에 OR 로 추가한다.
//    예: "잼버리" → glossary 에서 term_ko=잼버리, term_en=Jamboree 발견 시
//        검색식이 ("잼버리" OR "Jamboree") AND ... 로 확장됨
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {D1Database} db
 * @param {string[]} tokens - 사용자 입력 토큰들
 * @returns {Promise<{token: string, aliases: string[]}[]>}
 */
export async function findGlossaryAliases(db, tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return [];
  const out = [];
  for (const tok of tokens) {
    if (!tok || tok.length < 2) continue;
    try {
      const rows = await db.prepare(`
        SELECT term_ko, term_en, term_fr FROM glossary_terms
         WHERE term_ko = ? OR term_en = ? COLLATE NOCASE OR term_fr = ? COLLATE NOCASE
         LIMIT 1
      `).bind(tok, tok, tok).all();
      const row = rows?.results?.[0];
      if (row) {
        const aliases = [row.term_ko, row.term_en, row.term_fr]
          .filter((v) => v && v !== '-' && v.toLowerCase() !== tok.toLowerCase());
        if (aliases.length) out.push({ token: tok, aliases });
      }
    } catch {
      // glossary_terms 가 비어있거나 컬럼이 다르면 조용히 패스
    }
  }
  return out;
}

/**
 * buildSearchQuery 결과에 glossary alias 를 OR 로 합성한다.
 * @param {string} baseMatch - buildSearchQuery() 결과
 * @param {Array} aliasGroups - findGlossaryAliases() 결과
 * @returns {string}
 */
export function expandWithAliases(baseMatch, aliasGroups) {
  if (!baseMatch) return baseMatch;
  if (!Array.isArray(aliasGroups) || !aliasGroups.length) return baseMatch;
  const extras = [];
  for (const { aliases } of aliasGroups) {
    for (const a of aliases) {
      extras.push(escapeFtsToken(a));
    }
  }
  if (!extras.length) return baseMatch;
  return `(${baseMatch}) OR (${extras.join(' OR ')})`;
}
