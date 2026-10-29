import { queryRust } from './_shared/rust-server.js';

export async function onRequestGet({ request, env }) {
  const response = await queryRust({request,env}, 'robots-render', {origin:new URL(request.url).origin});
  if (!response.ok) throw new Error('Rust robots.txt rendering failed');
  const {text} = await response.json();
  return new Response(text, {headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'public, max-age=3600'}});
}
