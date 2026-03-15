export async function recordPostHistory(env, postId, action, post, summary) {
  if (!env || !env.DB || !postId || !post) return;
  try {
    await env.DB.prepare(
      `INSERT INTO post_history (post_id, action, summary, snapshot)
       VALUES (?, ?, ?, ?)`
    ).bind(
      postId,
      String(action || 'update').slice(0, 40),
      summary ? String(summary).slice(0, 200) : null,
      JSON.stringify(post)
    ).run();
  } catch (err) {
    console.error('recordPostHistory error:', err);
  }
}
