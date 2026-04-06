import { serveStoredBucketImage } from '../../_shared/image-storage.js';

export async function onRequestGet({ params, env }) {
  // [[key]] catch-all: params.key is an array of path segments
  const segments = Array.isArray(params.key) ? params.key : [params.key || ''];
  const key = segments.map(s => decodeURIComponent(s)).join('/').trim();
  if (!key) return new Response(null, { status: 404 });
  try {
    return await serveStoredBucketImage(env, key);
  } catch (err) {
    console.error('GET /api/images/:key error:', err);
    return new Response(null, { status: 500 });
  }
}
