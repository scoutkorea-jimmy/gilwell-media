import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';

export async function onRequestGet({ env, request }) {
  return handlePublishDue(env, request);
}

export async function onRequestPost({ env, request }) {
  return handlePublishDue(env, request);
}

async function handlePublishDue(env, request) {
  try {
    const origin = new URL(request.url).origin;
    const result = await ensureDuePostsPublished(env, origin);
    const published = Array.isArray(result && result.published) ? result.published : [];
    return json({
      success: true,
      published_count: published.length,
      post_ids: published.map((item) => item.id),
    });
  } catch (err) {
    console.error('GET /api/jobs/publish-due error:', err);
    return json({ error: '예약 공개 작업에 실패했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
