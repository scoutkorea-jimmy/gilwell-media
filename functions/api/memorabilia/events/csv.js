/**
 * GET  /api/memorabilia/events/csv             — 전체 행사 CSV export (관리자)
 * GET  /api/memorabilia/events/csv?template=1  — 샘플이 포함된 템플릿 CSV
 * POST /api/memorabilia/events/csv             — CSV 일괄 업로드 (body: text/csv 또는 JSON {csv:string})
 *
 * 사용자 친화 CSV 포맷 (2026-05-26 개선):
 *
 *   8개 컬럼 (한글 헤더 한 줄 + 영문 alias 자동 인식):
 *     슬러그 | 행사명(영문) | 행사명(국문) | 시작일 | 종료일 | 설명(영문) | 설명(국문) | 아카이브
 *
 *   영문 alias 도 그대로 허용: slug · name_en · name_ko · start_date · end_date · description_en · description_ko · archived
 *
 *   레거시 분할 컬럼(start_year / start_month / start_day / end_year / end_month / end_day) 도
 *   하위 호환을 위해 인식. 통합·분할 둘 다 있으면 통합값(start_date/end_date)이 우선.
 *
 *   날짜 컬럼은 자유 형식:
 *     "2023"            → 연도만
 *     "2023-08"         → 연 + 월        (2023.08 / 2023/08 / 2023년 8월 모두 동일 처리)
 *     "2023-08-01"      → 연 + 월 + 일   (2023.08.01 / 2023/08/01 / 2023년 8월 1일 모두 동일)
 *     "" / "-" / "x"    → 비움
 *
 *   archived 컬럼은: 0/1, true/false, yes/no, y/n, 활성/아카이브(=숨김) 모두 인식.
 *
 * Dedup (POST):
 *   1. slug 가 비어있지 않으면 → slug 매칭. 매칭되면 UPDATE, 아니면 INSERT.
 *   2. slug 가 비어있으면 → (name_en + name_ko) trim 매칭 → UPDATE / 없으면 INSERT.
 *
 * "동일 자료는 기존 데이터에 흡수" — 같은 행사를 다시 올리면 INSERT 가 아니라 UPDATE.
 *
 * 인코딩: UTF-8 + BOM (Excel 한글 호환).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { queryRust } from '../../../_shared/rust-server.js';

// ─── GET (export / template) ────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  const isTemplate = url.searchParams.get('template') === '1';

  try {
    const exported = await queryRust({request, env}, 'memorabilia-csv-export', {template:isTemplate});
    if (!exported.ok) throw new Error(isTemplate ? 'Rust CSV export failed' : 'Rust event list failed');
    const { csv } = await exported.json();

    const filename = isTemplate
      ? 'memorabilia-events-template.csv'
      : `memorabilia-events-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/memorabilia/events/csv error:', err);
    return json({ error: 'export_failed', detail: String(err && err.message || err) }, 500);
  }
}

// ─── POST (import) ──────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  let csvText = '';
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      csvText = String(body?.csv || '');
    } else {
      csvText = await request.text();
    }
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!csvText.trim()) return json({ error: 'empty_csv' }, 400);

  const parsedResponse = await queryRust({request, env}, 'memorabilia-csv-parse', {text:csvText});
  if (!parsedResponse.ok) throw new Error('Rust CSV parsing failed');
  const { failure, data: dataRows } = await parsedResponse.json();
  if (failure) return json(failure, 400);

  const preparedResponse = await queryRust({request, env}, 'memorabilia-csv-prepare', {rows:dataRows});
  if (!preparedResponse.ok) throw new Error('Rust CSV preparation failed');
  const { rows: preparedRows, validations, existing } = await preparedResponse.json();
  const imported = await queryRust({request, env}, 'memorabilia-csv-import', {rows:preparedRows, validations, existing});
  if (!imported.ok) throw new Error('Rust CSV import failed');
  return json(await imported.json());
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
