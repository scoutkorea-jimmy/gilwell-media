export async function recordPostHistory(env, postId, action, beforePost, afterPost, summary) {
  if (!env || !env.DB || !postId) return;
  const legacySnapshot = afterPost || beforePost || null;
  if (!legacySnapshot) return;
  try {
    await env.DB.prepare(
      `INSERT INTO post_history (post_id, action, summary, snapshot, before_snapshot, after_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      postId,
      String(action || 'update').slice(0, 40),
      summary ? String(summary).slice(0, 200) : null,
      JSON.stringify(legacySnapshot),
      beforePost ? JSON.stringify(beforePost) : null,
      afterPost ? JSON.stringify(afterPost) : null
    ).run();
  } catch (err) {
    console.error('recordPostHistory error:', err);
  }
}
