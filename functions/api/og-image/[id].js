/**
 * Gilwell Media · OG 공유 이미지 (초점 크롭)
 *
 * GET /api/og-image/:id
 *
 * 소셜 크롤러(카카오/페북/트위터)는 og:image 의 "원본 파일"을 그대로 가져가므로
 * CSS object-position 으로는 위치를 바꿀 수 없다. 그래서 이 엔드포인트가 글의 대표
 * 이미지를 1200×630 으로 cover-crop 하되, 운영자가 지정한 초점(posts.image_frame)을
 * Cloudflare Image Transformations 의 gravity 로 적용해 "보이고 싶은 부분"을 살린다.
 *
 * ── 자가 복구(self-healing) ──
 * Cloudflare 이미지 변환이 zone 에서 꺼져 있으면 fetch({cf:{image}}) 는 변환 옵션을
 * 조용히 무시하고 "원본 이미지"를 그대로 돌려준다(상태 200). 즉 변환을 켜기 전에는
 * 기존과 동일하게 원본이 공유되고, 켜는 순간 초점 크롭이 자동 적용된다. 별도 플래그·
 * 재배포 불필요.
 */
import { normalizeImageFrame } from '../../_shared/image-frame.js';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const DEFAULT_SHARE_IMAGE_PATH = '/img/og-default.png';

export async function onRequestGet({ params, env, request }) {
  const origin = new URL(request.url).origin;
  const id = parseInt(String(params.id || '').replace(/\.(png|jpg|jpeg|webp)$/i, ''), 10);
  if (!Number.isFinite(id) || id < 1) return redirectDefault(origin);

  let post;
  try {
    post = await env.DB.prepare(
      'SELECT image_url, image_frame, published FROM posts WHERE id = ?'
    ).bind(id).first();
  } catch (err) {
    console.error('GET /api/og-image/:id DB error:', err);
    return redirectDefault(origin);
  }

  // 비공개 글이나 대표 이미지가 없으면 사이트 기본 공유 이미지로.
  if (!post || Number(post.published || 0) !== 1 || !post.image_url) {
    return redirectDefault(origin);
  }

  // 원본 이미지 URL 해석 — data: 로 저장된 경우 R2 서빙 엔드포인트로 우회.
  const rawUrl = String(post.image_url || '');
  let source;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    source = rawUrl;
  } else {
    source = `${origin}/api/posts/${id}/image`;
  }

  const frame = normalizeImageFrame(post.image_frame) || { x: 50, y: 50 };
  const gravity = { x: clamp01(frame.x / 100), y: clamp01(frame.y / 100) };

  try {
    const resp = await fetch(source, {
      cf: {
        image: {
          width: OG_WIDTH,
          height: OG_HEIGHT,
          fit: 'cover',
          gravity,
          quality: 82,
          // 크롤러 호환을 위해 원본 포맷 유지(투명 PNG 보존). 'auto' 는 Accept 의존이라
          // 일부 크롤러에서 예측이 어려워 명시 생략.
        },
      },
    });

    if (!resp || !resp.ok) {
      // 변환/원본 fetch 실패 → 원본으로 우회(여전히 유효한 이미지 보장).
      return redirectTo(source);
    }

    const headers = new Headers();
    headers.set('Content-Type', resp.headers.get('Content-Type') || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    const cfResized = resp.headers.get('cf-resized');
    if (cfResized) headers.set('X-OG-Resized', cfResized);
    return new Response(resp.body, { status: 200, headers });
  } catch (err) {
    console.error('GET /api/og-image/:id transform error:', err);
    return redirectTo(source);
  }
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function redirectDefault(origin) {
  return redirectTo(`${origin}${DEFAULT_SHARE_IMAGE_PATH}`);
}

// /api 미들웨어가 응답 헤더를 추가(set)하므로, 헤더가 immutable 인 Response.redirect
// 대신 mutable 헤더를 가진 일반 302 응답을 만든다(immutable 헤더 set 시 throw 회피).
function redirectTo(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
