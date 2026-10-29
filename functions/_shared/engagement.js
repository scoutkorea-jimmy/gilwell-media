import { queryRust } from './rust-server.js';

export async function getViewerKey(request, env) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
    || '';
  if (!ip || !env || !env.ADMIN_SECRET) return null;

  const input = `${ip}|${env.ADMIN_SECRET}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hash;
}

export async function recordUniqueView(env, postId, viewerKey) {
  if (!viewerKey) return false;
  const viewBucket = String(Math.floor(Date.now() / (12 * 60 * 60 * 1000)));
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'post-views', {
    postId, viewerKey, viewBucket,
  });
  if (!rust.ok) throw new Error('Rust post view write failed');
  return (await rust.json()).counted;
}

// 기념품(memorabilia) 조회수 — posts.views 패턴 동일. 같은 뷰어는 12시간 버킷당 1회만.
export async function recordUniqueMemorabiliaView(env, memorabiliaId, viewerKey) {
  if (!viewerKey) return false;
  const viewBucket = String(Math.floor(Date.now() / (12 * 60 * 60 * 1000)));
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'memorabilia-view-record', {id:memorabiliaId,viewerKey,viewBucket});
  if (!response.ok) throw new Error('Rust memorabilia view record failed');
  return (await response.json()).counted;
}

export async function getLikeStats(env, postId, viewerKey) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'post-likes', {
    postId, viewerKey: viewerKey || null,
  });
  if (!rust.ok) throw new Error('Rust post likes query failed');
  return rust.json();
}

export function isLikelyNonHumanRequest(request) {
  if (!request) return false;
  const userAgent = String(request.headers.get('user-agent') || '').toLowerCase();
  const purpose = String(request.headers.get('purpose') || request.headers.get('x-purpose') || '').toLowerCase();
  const secPurpose = String(request.headers.get('sec-purpose') || '').toLowerCase();
  const moz = String(request.headers.get('x-moz') || '').toLowerCase();

  if (purpose.includes('prefetch') || purpose.includes('preview') || secPurpose.includes('prefetch') || moz.includes('prefetch')) {
    return true;
  }

  const botPatterns = [
    'bot', 'spider', 'crawl', 'slurp', 'bingpreview', 'facebookexternalhit',
    'meta-externalagent', 'discordbot', 'telegrambot', 'slackbot', 'whatsapp',
    'kakaotalk', 'kakao', 'linkedinbot', 'pinterest', 'redditbot', 'embedly',
    'quora link preview', 'applebot', 'lighthouse', 'pagespeed', 'headlesschrome',
    'curl', 'wget', 'python-requests', 'axios', 'go-http-client', 'java/', 'okhttp',
    'node-fetch', 'undici', 'googleother', 'apis-google', 'inspectiontool',
    'adsbot-google', 'mediapartners-google'
  ];
  return botPatterns.some((pattern) => userAgent.includes(pattern));
}
