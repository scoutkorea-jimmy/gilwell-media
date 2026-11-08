export function sanitizeYouTubeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  let videoId = '';
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v') || '';
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] || '';
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/')[2] || '';
    }
  } else if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/')[1] || '';
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(value) {
  const sanitized = sanitizeYouTubeUrl(value);
  if (!sanitized) return '';
  const videoId = new URL(sanitized).searchParams.get('v');
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}
