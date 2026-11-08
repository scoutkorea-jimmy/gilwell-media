export function normalizePath(path) {
  const value = String(path || '').trim();
  if (!value || value[0] !== '/') return '';
  return value.replace(/[?#].*$/, '');
}

export function classifyJourneyStage(path) {
  const value = normalizePath(path);
  if (!value) return 'awareness';
  if (value.indexOf('/post/') === 0) return 'consideration';
  if (
    value === '/' ||
    value === '/index.html' ||
    value === '/calendar' ||
    value === '/calendar.html' ||
    value === '/contributors' ||
    value === '/contributors.html' ||
    value === '/wosm-members' ||
    value === '/wosm-members.html'
  ) return 'awareness';
  if (value === '/dreampath' || value === '/dreampath/' || value === '/dreampath.html') return 'interest';
  return 'interest';
}


export function classifyReferrer(referrerHost, referrerUrl, utmSource, utmMedium, utmCampaign) {
  const host = String(referrerHost || '').trim().toLowerCase();
  const source = String(utmSource || '').trim().toLowerCase();
  const medium = String(utmMedium || '').trim().toLowerCase();
  const campaign = String(utmCampaign || '').trim().toLowerCase();
  if (source) {
    if (source === 'kakaotalk') return sourceInfo('utm-kakaotalk', '카카오톡 공유', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    if (source === 'facebook') return sourceInfo('utm-facebook', '페이스북 공유', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    if (source === 'copy') return sourceInfo('utm-copy', '직접 공유 URL', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    return sourceInfo('utm-' + source, 'UTM · ' + source, 'campaign', campaign || medium || source);
  }
  if (!host || host === 'direct') return sourceInfo('direct', '직접 방문', 'direct', '리퍼러 없음 또는 앱 브라우저 미제공');
  if (host === 'internal') return sourceInfo('internal', '내부 이동', 'internal', '');
  const known = matchKnownReferrer(host, referrerUrl);
  if (known) return known;
  return sourceInfo('site:' + simplifyDomain(host), simplifyDomain(host), 'site', host);
}

function matchKnownReferrer(host, referrerUrl) {
  const pathname = safePathname(referrerUrl);
  const searchPath = pathname.indexOf('/search') >= 0 || pathname.indexOf('/m/search') >= 0;
  if (host.indexOf('story.kakao.com') >= 0) return sourceInfo('kakao-story', '카카오스토리', 'social', host);
  if (host.indexOf('kakao.com') >= 0 || host.indexOf('kakao') >= 0) return sourceInfo('kakao', '카카오', 'messenger', host);
  if (host.indexOf('search.naver.com') >= 0 || host.indexOf('naver.com') >= 0) return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'naver-search' : 'naver', searchPath || host.indexOf('search.') >= 0 ? '네이버 검색' : '네이버', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('google.') >= 0) return sourceInfo(pathname.indexOf('/search') >= 0 ? 'google-search' : 'google', pathname.indexOf('/search') >= 0 ? '구글 검색' : '구글', pathname.indexOf('/search') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('search.daum.net') >= 0 || host.indexOf('daum.net') >= 0) return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'daum-search' : 'daum', searchPath || host.indexOf('search.') >= 0 ? '다음 검색' : '다음', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('bing.com') >= 0) return sourceInfo('bing', 'Bing', 'search', host);
  if (host.indexOf('instagram.com') >= 0) return sourceInfo('instagram', '인스타그램', 'social', host);
  if (host.indexOf('facebook.com') >= 0) return sourceInfo('facebook', '페이스북', 'social', host);
  if (host === 't.co' || host.indexOf('twitter.com') >= 0 || host.indexOf('x.com') >= 0) return sourceInfo('x', 'X / Twitter', 'social', host);
  if (host.indexOf('threads.net') >= 0) return sourceInfo('threads', 'Threads', 'social', host);
  if (host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0) return sourceInfo('youtube', '유튜브', 'video', host);
  if (host.indexOf('linkedin.com') >= 0 || host.indexOf('lnkd.in') >= 0) return sourceInfo('linkedin', '링크드인', 'social', host);
  if (host.indexOf('line.me') >= 0) return sourceInfo('line', 'LINE', 'messenger', host);
  if (host.indexOf('whatsapp.com') >= 0) return sourceInfo('whatsapp', 'WhatsApp', 'messenger', host);
  if (host.indexOf('telegram') >= 0 || host === 't.me') return sourceInfo('telegram', 'Telegram', 'messenger', host);
  if (host.indexOf('discord') >= 0) return sourceInfo('discord', 'Discord', 'community', host);
  if (host.indexOf('reddit.com') >= 0) return sourceInfo('reddit', 'Reddit', 'community', host);
  if (host.indexOf('band.us') >= 0) return sourceInfo('band', '네이버 밴드', 'community', host);
  return null;
}

function sourceInfo(key, label, type, detail) {
  return { key, label, type, detail };
}

function simplifyDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return String(host || '');
  return parts.slice(-2).join('.');
}

function safePathname(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch (_) {
    return '';
  }
}
