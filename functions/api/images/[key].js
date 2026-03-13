import { serveStoredBucketImage } from '../../_shared/image-storage.js';

export async function onRequestGet({ params, env }) {
  const key = decodeURIComponent(params.key || '').trim();
  if (!key) return new Response(null, { status: 404 });
  try {
    return await serveStoredBucketImage(env, key);
  } catch (err) {
    console.error('GET /api/images/:key error:', err);
    return new Response(null, { status: 500 });
  }
}
