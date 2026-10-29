export function aggregateReferrers(rows) {
  const bySource = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const source = classifyReferrer(row && row.referrer_host, row && row.referrer_url, row && row.utm_source, row && row.utm_medium, row && row.utm_campaign);
    const current = bySource.get(source.key) || {
      source_key: source.key,
      source_label: source.label,
      source_type: source.type,
      source_type_label: source.typeLabel,
      source_detail: source.detail,
      referrer_host: row && row.referrer_host ? row.referrer_host : source.key,
      visits: 0,
      pageviews: 0,
    };
    current.visits += Number(row && row.visits || 0);
    current.pageviews += Number(row && row.pageviews || 0);
    bySource.set(source.key, current);
  });
  return Array.from(bySource.values())
    .sort((a, b) => b.visits - a.visits || b.pageviews - a.pageviews || a.source_label.localeCompare(b.source_label, 'ko'))
    .slice(0, 12);
}

function classifyReferrer(referrerHost, referrerUrl, utmSource, utmMedium, utmCampaign) {
  const host = String(referrerHost || '').trim().toLowerCase();
  const url = String(referrerUrl || '').trim();
  const source = String(utmSource || '').trim().toLowerCase();
  const medium = String(utmMedium || '').trim().toLowerCase();
  const campaign = String(utmCampaign || '').trim().toLowerCase();

  if (source) {
    if (source === 'kakaotalk') return sourceInfo('utm-kakaotalk', '카카오톡 공유', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    if (source === 'facebook') return sourceInfo('utm-facebook', '페이스북 공유', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    if (source === 'copy') return sourceInfo('utm-copy', '직접 공유 URL', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    return sourceInfo('utm-' + source, 'UTM · ' + source, 'campaign', '캠페인', campaign || medium || source);
  }

  if (!host || host === 'direct') {
    return {
      key: 'direct',
      label: '직접 방문',
      type: 'direct',
      typeLabel: '직접',
      detail: '리퍼러 없음 또는 앱 브라우저 미제공',
    };
  }

  if (host === 'internal') {
    return {
      key: 'internal',
      label: '내부 이동',
      type: 'internal',
      typeLabel: '내부',
      detail: '',
    };
  }

  if (host === 'unknown') {
    return {
      key: 'unknown',
      label: '알 수 없음',
      type: 'unknown',
      typeLabel: '미분류',
      detail: '리퍼러 URL 해석 실패',
    };
  }

  const known = matchKnownReferrer(host, url);
  if (known) return known;

  const domain = simplifyDomain(host);
  return {
    key: 'site:' + domain,
    label: domain,
    type: 'site',
    typeLabel: '외부 사이트',
    detail: host,
  };
}

function matchKnownReferrer(host, referrerUrl) {
  const pathname = safePathname(referrerUrl);
  const searchPath = pathname.indexOf('/search') >= 0 || pathname.indexOf('/m/search') >= 0;

  if (host.indexOf('story.kakao.com') >= 0) {
    return sourceInfo('kakao-story', '카카오스토리', 'social', '소셜', host);
  }
  if (host.indexOf('kakao.com') >= 0 || host.indexOf('kakao') >= 0) {
    return sourceInfo('kakao', '카카오', 'messenger', '메신저', host);
  }
  if (host.indexOf('search.naver.com') >= 0 || host.indexOf('naver.com') >= 0) {
    return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'naver-search' : 'naver', searchPath || host.indexOf('search.') >= 0 ? '네이버 검색' : '네이버', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', searchPath || host.indexOf('search.') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('google.') >= 0) {
    return sourceInfo(pathname.indexOf('/search') >= 0 ? 'google-search' : 'google', pathname.indexOf('/search') >= 0 ? '구글 검색' : '구글', pathname.indexOf('/search') >= 0 ? 'search' : 'portal', pathname.indexOf('/search') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('search.daum.net') >= 0 || host.indexOf('daum.net') >= 0) {
    return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'daum-search' : 'daum', searchPath || host.indexOf('search.') >= 0 ? '다음 검색' : '다음', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', searchPath || host.indexOf('search.') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('bing.com') >= 0) {
    return sourceInfo('bing', 'Bing', 'search', '검색', host);
  }
  if (host.indexOf('instagram.com') >= 0) {
    return sourceInfo('instagram', '인스타그램', 'social', '소셜', host);
  }
  if (host.indexOf('facebook.com') >= 0) {
    return sourceInfo('facebook', '페이스북', 'social', '소셜', host);
  }
  if (host === 't.co' || host.indexOf('twitter.com') >= 0 || host.indexOf('x.com') >= 0) {
    return sourceInfo('x', 'X / Twitter', 'social', '소셜', host);
  }
  if (host.indexOf('threads.net') >= 0) {
    return sourceInfo('threads', 'Threads', 'social', '소셜', host);
  }
  if (host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0) {
    return sourceInfo('youtube', '유튜브', 'video', '영상', host);
  }
  if (host.indexOf('linkedin.com') >= 0 || host.indexOf('lnkd.in') >= 0) {
    return sourceInfo('linkedin', '링크드인', 'social', '소셜', host);
  }
  if (host.indexOf('line.me') >= 0) {
    return sourceInfo('line', 'LINE', 'messenger', '메신저', host);
  }
  if (host.indexOf('whatsapp.com') >= 0) {
    return sourceInfo('whatsapp', 'WhatsApp', 'messenger', '메신저', host);
  }
  if (host.indexOf('telegram') >= 0 || host === 't.me') {
    return sourceInfo('telegram', 'Telegram', 'messenger', '메신저', host);
  }
  if (host.indexOf('discord') >= 0) {
    return sourceInfo('discord', 'Discord', 'community', '커뮤니티', host);
  }
  if (host.indexOf('reddit.com') >= 0) {
    return sourceInfo('reddit', 'Reddit', 'community', '커뮤니티', host);
  }
  if (host.indexOf('band.us') >= 0) {
    return sourceInfo('band', '네이버 밴드', 'community', '커뮤니티', host);
  }
  return null;
}

function sourceInfo(key, label, type, typeLabel, detail) {
  return {
    key: key,
    label: label,
    type: type,
    typeLabel: typeLabel,
    detail: detail,
  };
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
