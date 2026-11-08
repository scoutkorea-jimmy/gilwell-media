// Preserve historical data while permanently closing the retired calendar routes.
export function retiredCalendarResponse(request) {
  const api = new URL(request.url).pathname.startsWith('/api/');
  const body = api ? JSON.stringify({ error: '캘린더 기능이 종료되었습니다.' }) : '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>종료된 서비스 — BP미디어</title><h1>캘린더 기능이 종료되었습니다.</h1><p><a href="/">BP미디어 홈으로 이동</a></p></html>';
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 410,
    headers: { 'Content-Type': api ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export function onRequest({ request }) { return retiredCalendarResponse(request); }
