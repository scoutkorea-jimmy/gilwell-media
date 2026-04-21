/**
 * GET /api/admin/ai-score-history
 *
 * AI 채점 기록을 페이지네이션/검색 가능한 형태로 반환.
 *
 * Query params:
 *   limit     — 페이지당 항목 수 (기본 30, 최대 100)
 *   offset    — 시작 오프셋 (기본 0)
 *   q         — 제목 부분 일치 검색
 *   grade     — 등급 필터 (S/A/B/C/D)
 *   min_score — 최소 점수 (0-100)
 *
 * 관리자 인증 필수. 등급별·점수 기반 정렬·검색으로 품질 추이 파악용.
 */
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'ai-score-history', 'view'); if (__gate) return __gate
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const url = new URL(request.url);
  const limit = clamp(parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
  const grade = String(url.searchParams.get('grade') || '').trim().toUpperCase();
  const minScoreRaw = parseInt(url.searchParams.get('min_score') || '', 10);
  const minScore = Number.isFinite(minScoreRaw) ? clamp(minScoreRaw, 0, 100) : null;

  const where = [];
  const args = [];
  if (q) {
    where.push("(COALESCE(input_title,'') LIKE ? OR COALESCE(overall_summary,'') LIKE ?)");
    const pat = `%${q}%`;
    args.push(pat, pat);
  }
  if (grade && ['S', 'A', 'B', 'C', 'D'].includes(grade)) {
    where.push('overall_grade = ?');
    args.push(grade);
  }
  if (minScore !== null) {
    where.push('overall_score >= ?');
    args.push(minScore);
  }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [items, totalRow, stats] = await Promise.all([
      env.DB.prepare(
        `SELECT id, created_at, actor, input_title, input_subtitle, input_body_chars,
                input_tags, overall_score, overall_grade, overall_summary,
                improvement, revision_suggestion, categories_json,
                latency_ms, total_tokens, status, error_code
         FROM ai_score_log
         ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`
      ).bind(...args, limit, offset).all().then((r) => r.results || []),
      env.DB.prepare(
        `SELECT COUNT(*) AS total FROM ai_score_log ${whereClause}`
      ).bind(...args).first(),
      env.DB.prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(AVG(overall_score), 0) AS avg_score,
          SUM(CASE WHEN overall_grade = 'S' THEN 1 ELSE 0 END) AS grade_s,
          SUM(CASE WHEN overall_grade = 'A' THEN 1 ELSE 0 END) AS grade_a,
          SUM(CASE WHEN overall_grade = 'B' THEN 1 ELSE 0 END) AS grade_b,
          SUM(CASE WHEN overall_grade = 'C' THEN 1 ELSE 0 END) AS grade_c,
          SUM(CASE WHEN overall_grade = 'D' THEN 1 ELSE 0 END) AS grade_d,
          COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
         FROM ai_score_log`
      ).first(),
    ]);

    const enriched = (items || []).map((row) => {
      let categories = [];
      if (row.categories_json) {
        try { categories = JSON.parse(row.categories_json); } catch (_) {}
      }
      return {
        id: row.id,
        created_at: row.created_at,
        created_at_kst: formatKst(row.created_at),
        actor: row.actor,
        input_title: row.input_title,
        input_subtitle: row.input_subtitle,
        input_body_chars: row.input_body_chars,
        input_tags: row.input_tags,
        overall_score: row.overall_score,
        overall_grade: row.overall_grade,
        overall_summary: row.overall_summary,
        improvement: row.improvement,
        revision_suggestion: row.revision_suggestion,
        categories,
        latency_ms: row.latency_ms,
        total_tokens: row.total_tokens,
        status: row.status,
        error_code: row.error_code,
      };
    });

    return json({
      items: enriched,
      pagination: {
        total: Number(totalRow?.total || 0),
        limit,
        offset,
        has_more: (offset + enriched.length) < Number(totalRow?.total || 0),
      },
      stats: {
        total: Number(stats?.total || 0),
        avg_score: Math.round(Number(stats?.avg_score || 0)),
        grade_distribution: {
          S: Number(stats?.grade_s || 0),
          A: Number(stats?.grade_a || 0),
          B: Number(stats?.grade_b || 0),
          C: Number(stats?.grade_c || 0),
          D: Number(stats?.grade_d || 0),
        },
        avg_latency_ms: Math.round(Number(stats?.avg_latency_ms || 0)),
      },
      generated_at: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    return json({ error: 'DB 오류', detail: String((err && err.message) || err) }, 500);
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatKst(unixSec) {
  const n = Number(unixSec);
  if (!Number.isFinite(n) || n <= 0) return '';
  // +9 hours for KST; output YYYY-MM-DD HH:mm:ss
  const d = new Date(n * 1000 + 9 * 3600 * 1000);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
