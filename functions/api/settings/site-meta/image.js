import { loadSiteMeta, serveStoredImage } from '../../../_shared/site-meta.js';

export async function onRequestGet({ env }) {
  const meta = await loadSiteMeta(env);
  return serveStoredImage(meta.image_url);
}
