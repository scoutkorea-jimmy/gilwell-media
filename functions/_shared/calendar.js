export async function ensureCalendarTable(env) {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      location_name TEXT,
      location_address TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT,
      link_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function normalizeCalendarInput(body) {
  const title = String(body && body.title || '').trim().slice(0, 200);
  const description = String(body && body.description || '').trim().slice(0, 2000);
  const location_name = String(body && body.location_name || '').trim().slice(0, 120);
  const location_address = String(body && body.location_address || '').trim().slice(0, 300);
  const start_at = normalizeDateTime(body && body.start_at);
  const end_at = normalizeDateTime(body && body.end_at);
  const link_url = normalizeUrl(body && body.link_url);

  if (!title) return { error: '일정 제목을 입력해주세요.' };
  if (!start_at) return { error: '시작 일시를 입력해주세요.' };
  if (end_at && end_at < start_at) return { error: '종료 일시는 시작 일시보다 늦어야 합니다.' };

  return {
    title,
    description,
    location_name: location_name || null,
    location_address: location_address || null,
    start_at,
    end_at: end_at || null,
    link_url,
  };
}

export function normalizeCalendarRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return {
      id: row.id || 0,
      title: row.title || '',
      description: row.description || '',
      location_name: row.location_name || '',
      location_address: row.location_address || '',
      start_at: row.start_at || '',
      end_at: row.end_at || '',
      link_url: row.link_url || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    };
  });
}

function normalizeDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withSpace = raw.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(withSpace)) return withSpace + ':00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(withSpace)) return withSpace;
  return '';
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().slice(0, 500);
  } catch (_) {
    return null;
  }
}
