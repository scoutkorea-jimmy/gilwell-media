export async function ensureCalendarTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      title_original TEXT,
      event_category TEXT NOT NULL DEFAULT 'WOSM',
      event_tags TEXT,
      description TEXT,
      country_name TEXT,
      location_name TEXT,
      location_address TEXT,
      latitude REAL,
      longitude REAL,
      related_post_id INTEGER,
      related_posts_json TEXT,
      start_at TEXT NOT NULL,
      start_has_time INTEGER NOT NULL DEFAULT 0,
      end_at TEXT,
      end_has_time INTEGER NOT NULL DEFAULT 0,
      link_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await ensureCalendarColumn(env, 'title_original', 'TEXT');
  await ensureCalendarColumn(env, 'event_category', "TEXT NOT NULL DEFAULT 'WOSM'");
  await ensureCalendarColumn(env, 'event_tags', 'TEXT');
  await ensureCalendarColumn(env, 'country_name', 'TEXT');
  await ensureCalendarColumn(env, 'latitude', 'REAL');
  await ensureCalendarColumn(env, 'longitude', 'REAL');
  await ensureCalendarColumn(env, 'related_post_id', 'INTEGER');
  await ensureCalendarColumn(env, 'related_posts_json', 'TEXT');
  await ensureCalendarColumn(env, 'start_has_time', 'INTEGER DEFAULT 0');
  await ensureCalendarColumn(env, 'end_has_time', 'INTEGER DEFAULT 0');
  await ensureCalendarColumn(env, 'target_groups', 'TEXT');
}

export function normalizeCalendarInput(body) {
  const title = String(body && body.title || '').trim().slice(0, 200);
  const title_original = String(body && body.title_original || '').trim().slice(0, 200);
  const event_category = normalizeCategory(body && body.event_category);
  const event_tags = normalizeTags(body && body.event_tags);
  const description = String(body && body.description || '').trim().slice(0, 2000);
  const country_name = String(body && body.country_name || '').trim().slice(0, 120);
  const location_name = String(body && body.location_name || '').trim().slice(0, 120);
  const location_address = String(body && body.location_address || '').trim().slice(0, 300);
  const latitude = normalizeCoordinate(body && body.latitude, -90, 90);
  const longitude = normalizeCoordinate(body && body.longitude, -180, 180);
  const startValue = normalizeCalendarDateTimeValue(
    body && body.start_at,
    body && body.start_date,
    body && body.start_time
  );
  const endValue = normalizeCalendarDateTimeValue(
    body && body.end_at,
    body && body.end_date,
    body && body.end_time
  );
  const link_url = normalizeUrl(body && body.link_url);
  const target_groups = normalizeTargetGroups(body && body.target_groups);
  const related_post_id = normalizeInteger(body && body.related_post_id);
  const related_posts = normalizeRelatedPosts(body && (body.related_posts || body.related_post_ids));

  if (!title && !title_original) return { error: '행사명(국문) 또는 원문 제목을 입력해주세요.' };
  if (!startValue.value) return { error: '행사 시작 일을 입력해주세요.' };
  if (endValue.value && endValue.value < startValue.value) return { error: '종료 일시는 시작 일시보다 늦어야 합니다.' };

  return {
    title: title || title_original,
    title_original: title ? (title_original || null) : null,
    event_category,
    event_tags: JSON.stringify(event_tags),
    description,
    country_name: country_name || null,
    location_name: location_name || null,
    location_address: location_address || null,
    latitude,
    longitude,
    related_post_id,
    related_posts_json: JSON.stringify(related_posts),
    start_at: startValue.value,
    start_has_time: startValue.hasTime ? 1 : 0,
    end_at: endValue.value || null,
    end_has_time: endValue.value ? (endValue.hasTime ? 1 : 0) : 0,
    link_url,
    target_groups: JSON.stringify(target_groups),
  };
}

export function normalizeCalendarRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return {
      id: row.id || 0,
      title: row.title || '',
      title_original: row.title_original || '',
      event_category: row.event_category || 'WOSM',
      event_tags: parseTags(row.event_tags),
      description: row.description || '',
      country_name: row.country_name || '',
      location_name: row.location_name || '',
      location_address: row.location_address || '',
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      related_post_id: row.related_post_id == null ? null : Number(row.related_post_id),
      related_post_title: row.related_post_title || '',
      related_post_category: row.related_post_category || '',
      related_posts: parseRelatedPosts(row.related_posts_json, row),
      start_at: row.start_at || '',
      start_has_time: Number(row.start_has_time || 0) === 1,
      end_at: row.end_at || '',
      end_has_time: Number(row.end_has_time || 0) === 1,
      link_url: row.link_url || '',
      target_groups: parseTargetGroups(row.target_groups),
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    };
  });
}

function normalizeCalendarDateTimeValue(rawDateTime, rawDate, rawTime) {
  const direct = normalizeDateTime(rawDateTime);
  if (direct) {
    return {
      value: direct,
      hasTime: / \d{2}:\d{2}:\d{2}$/.test(direct) && !/ 00:00:00$/.test(direct),
    };
  }
  const date = normalizeDateOnly(rawDate);
  if (!date) return { value: '', hasTime: false };
  const time = normalizeTimeOnly(rawTime);
  return {
    value: date + ' ' + (time || '00:00:00'),
    hasTime: !!time,
  };
}

function normalizeDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + ' 00:00:00';
  const withSpace = raw.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(withSpace)) return withSpace + ':00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(withSpace)) return withSpace;
  return '';
}

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeTimeOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}:\d{2}$/.test(raw)) return raw + ':00';
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
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

function normalizeInteger(value) {
  if (value === '' || value == null) return null;
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const seen = new Set();
  return source
    .map(function (item) { return String(item || '').trim(); })
    .filter(function (item) {
      if (!item || item.length > 40 || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 20);
}

function parseTags(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed) : [];
  } catch (_) {
    return normalizeTags(String(value).split(','));
  }
}

function normalizeRelatedPosts(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const id = normalizeInteger(item.id);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        id: id,
        title: String(item.title || '').trim().slice(0, 200),
        category: String(item.category || '').trim().slice(0, 40),
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function parseRelatedPosts(value, row) {
  if (value) {
    try {
      const parsed = JSON.parse(String(value));
      const normalized = normalizeRelatedPosts(parsed);
      if (normalized.length) return normalized;
    } catch (_) {}
  }
  if (row && row.related_post_id) {
    return [{
      id: Number(row.related_post_id),
      title: row.related_post_title || '',
      category: row.related_post_category || '',
    }];
  }
  return [];
}

function normalizeTargetGroups(value) {
  const VALID = ['비버', '컵', '스카우트', '벤처', '로버', '지도자', '범스카우트', '훈련교수회'];
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.filter(function (item) {
    const s = String(item || '').trim();
    if (!s || !VALID.includes(s) || seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

function parseTargetGroups(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTargetGroups(parsed) : [];
  } catch (_) {
    return [];
  }
}
