import { queryRust } from '../../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../../_shared/auth.js';
import { summarizeHistoryDiff } from '../../../_shared/post-history.js';

export async function onRequestGet({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  }

  // ?detail=full 시에만 무거운 before/after_snapshot JSON을 응답에 포함.
  // 기본 경로는 요약 diff만 보내서 페이로드를 줄인다.
  const url = new URL(request.url);
  const wantFullDetail = url.searchParams.get('detail') === 'full';

  try {
    const response = await queryRust({env,request}, 'post-history', {id});
    if (!response.ok) throw new Error('Rust post history failed');
    const {post,items:results} = await response.json();
    if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

    return json({
      post,
      history: (results || []).map(function (item) {
        const before = item.before_snapshot || null;
        const after = item.after_snapshot || item.snapshot || null;
        const diff = summarizeHistoryDiff(before, after);
        const row = {
          id: item.id || 0,
          action: item.action || 'update',
          summary: item.summary || '',
          created_at: item.created_at || '',
          diff,
        };
        if (wantFullDetail) {
          row.snapshot = item.snapshot || null;
          row.before_snapshot = before;
          row.after_snapshot = after;
        }
        return row;
      }),
    });
  } catch (err) {
    console.error('GET /api/posts/:id/history error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
