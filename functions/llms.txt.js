import { queryRust } from './_shared/rust-server.js';

export async function onRequestGet({ request, env }) {
  const response = await queryRust({request, env}, 'llms-recent', {
    origin:new URL(request.url).origin, year:new Date().getFullYear(),
  });
  if (!response.ok) throw new Error('Rust llms.txt rendering failed');
  const {text} = await response.json();
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'public, max-age=1800',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const onRequestHead = onRequestGet;
