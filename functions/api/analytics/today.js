import { queryRust } from '../../_shared/rust-server.js';

export async function onRequestGet({ env }) {
  try {
    const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'visit-analytics-response', {});
    if (!rust.ok) throw new Error('Rust visit analytics failed');
    return json(await rust.json());
  } catch (err) {
    console.error('GET /api/analytics/today error:', err);
    return json({ error: 'Database error' }, 500);
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
