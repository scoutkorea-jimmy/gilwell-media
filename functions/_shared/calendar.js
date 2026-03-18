export async function ensureCalendarTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_category TEXT NOT NULL DEFAULT 'WOSM',
      description TEXT,
      country_name TEXT,
      location_name TEXT,
      location_address TEXT,
      latitude REAL,
      longitude REAL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      link_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await ensureCalendarColumn(env, 'event_category', "TEXT NOT NULL DEFAULT 'WOSM'");
  await ensureCalendarColumn(env, 'country_name', 'TEXT');
  await ensureCalendarColumn(env, 'latitude', 'REAL');
  await ensureCalendarColumn(env, 'longitude', 'REAL');
}

export function normalizeCalendarInput(body) {
  const title = String(body && body.title || '').trim().slice(0, 200);
  const event_category = normalizeCategory(body && body.event_category);
  const description = String(body && body.description || '').trim().slice(0, 2000);
  const country_name = String(body && body.country_name || '').trim().slice(0, 120);
  const location_name = String(body && body.location_name || '').trim().slice(0, 120);
  const location_address = String(body && body.location_address || '').trim().slice(0, 300);
  const latitude = normalizeCoordinate(body && body.latitude, -90, 90);
  const longitude = normalizeCoordinate(body && body.longitude, -180, 180);
  const start_at = normalizeDateTime(body && body.start_at);
  const end_at = normalizeDateTime(body && body.end_at);
  const link_url = normalizeUrl(body && body.link_url);

  if (!title) return { error: '일정 제목을 입력해주세요.' };
  if (!start_at) return { error: '시작 일시를 입력해주세요.' };
  if (end_at && end_at < start_at) return { error: '종료 일시는 시작 일시보다 늦어야 합니다.' };

  return {
    title,
    event_category,
    description,
    country_name: country_name || null,
    location_name: location_name || null,
    location_address: location_address || null,
    latitude,
    longitude,
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
      event_category: row.event_category || 'WOSM',
      description: row.description || '',
      country_name: row.country_name || '',
      location_name: row.location_name || '',
      location_address: row.location_address || '',
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
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

async function ensureCalendarColumn(env, columnName, sqlType) {
  const pragma = await env.DB.prepare(`PRAGMA table_info(calendar_events)`).all();
  const exists = (pragma.results || []).some(function (row) { return row.name === columnName; });
  if (!exists) {
    await env.DB.prepare(`ALTER TABLE calendar_events ADD COLUMN ${columnName} ${sqlType}`).run();
  }
}

function normalizeCategory(value) {
  const raw = String(value || '').trim().toUpperCase();
  return ['KOR', 'APR', 'EUR', 'AFR', 'ARB', 'IAR', 'WOSM'].indexOf(raw) >= 0 ? raw : 'WOSM';
}

function normalizeCoordinate(value, min, max) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return Math.round(num * 1000000) / 1000000;
}
