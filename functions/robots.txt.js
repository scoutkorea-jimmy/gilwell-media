export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const body = [
    'User-agent: Googlebot',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin.html',
    'Disallow: /api/admin/',
    '',
    'User-agent: Googlebot-Image',
    'Allow: /',
    '',
    'User-agent: AdsBot-Google',
    'Allow: /',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin.html',
    'Disallow: /api/admin/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
