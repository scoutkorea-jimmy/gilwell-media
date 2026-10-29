import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const SETTING_KEY = 'reference_sites';
const MAX_ITEMS = 200;
const ALLOWED_FEDERATIONS = ['Africa', 'Arab', 'Asia-Pacific', 'European', 'Interamerican', 'WOSM', 'Unclassified'];

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'reference-sites', 'view'); if (__gate) return __gate;

  try {
    const rust = await queryRust({request, env}, 'settings-read', {target:'reference_sites'});
    if (!rust.ok) throw new Error('Rust reference settings read failed');
    const {rows} = await rust.json();
    const [row, revRow] = rows;
    const items = await sanitizeReferenceSitesRust(parseReferenceSites(row && row.value), env);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json({ items, revision });
  } catch (err) {
    console.error('GET /api/settings/reference-sites error:', err);
    return json({ error: '참고 사이트를 불러오지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'reference-sites', 'write'); if (__gate) return __gate;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const ifRevision = body && body.if_revision;
  const items = await sanitizeReferenceSitesRust(body && body.items, env);

  try {
    const snapshot = await queryRust({request, env}, 'settings-read', {target:'reference_save'});
    if (!snapshot.ok) throw new Error('Rust settings snapshot failed');
    const {rows} = await snapshot.json();
    const [prevRow, revRow] = rows;
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }

    const nextRev = currentRev + 1;
    const rust = await queryRust({request, env}, 'settings-save', {target:'reference_sites', currentRev, nextRev:String(nextRev), values:[JSON.stringify(items)]});
    if (!rust.ok) throw new Error('Rust reference sites write failed');
    const {changes} = await rust.json();
    if (changes !== 1) return json({ error: '다른 변경이 감지되었습니다. 입력은 유지됩니다.' }, 409);
    await recordSettingChange(env, {
      key: SETTING_KEY,
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/reference-sites',
      message: '기사 참고 사이트 설정 변경',
      details: { revision: nextRev, count: items.length },
    });
    return json({ items, revision: nextRev });
  } catch (err) {
    console.error('PUT /api/settings/reference-sites error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function parseReferenceSites(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

export function sanitizeReferenceSites(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .slice(0, MAX_ITEMS)
    .map((item) => sanitizeReferenceSiteItem(item))
    .filter((item) => item.name || item.url || item.summary);
}

export async function sanitizeReferenceSitesRust(raw, env = {}, run = queryRust) {
  const fallback = () => sanitizeReferenceSites(raw);
  try {
    const items=(Array.isArray(raw)?raw:[]).slice(0,MAX_ITEMS).map(item=>{
      const source=item && typeof item==='object'?item:{};
      return {name:String(source.name||''),url:String(source.url||''),summary:String(source.summary||''),federations:(Array.isArray(source.related_federations)?source.related_federations:[]).map(value=>String(value||''))};
    });
    if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(items))) return fallback();
    const response=await run({env,request:{url:'https://internal.invalid/'}},'reference-sites-normalize',{items});
    if (!response.ok) return fallback();
    const result=await response.json(); if (!Array.isArray(result.items) || result.items.length > items.length) return fallback();
    const decode=(units,max)=>{if(!Array.isArray(units)||units.length>max||!units.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)) throw new Error('Invalid text'); let value=''; for(let i=0;i<units.length;i+=512) value+=String.fromCharCode(...units.slice(i,i+512)); return value;};
    const output=result.items.map(item=>{
      if(!item || typeof item.url!=='string' || !Array.isArray(item.related_federations) || new Set(item.related_federations).size!==item.related_federations.length || !item.related_federations.every(f=>ALLOWED_FEDERATIONS.includes(f))) throw new Error('Invalid site');
      if (item.url) { const url=new URL(item.url); if (!['http:','https:'].includes(url.protocol) || url.href!==item.url) throw new Error('Invalid URL'); }
      return {name:decode(item.name,120),url:item.url,summary:decode(item.summary,1000),related_federations:item.related_federations};
    });
    if (output.some(item=>!item.name && !item.url && !item.summary)) return fallback();
    return output;
  } catch {return fallback();}
}

function sanitizeReferenceSiteItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    name: cleanText(source.name, 120),
    url: cleanUrl(source.url, 400),
    summary: cleanText(source.summary, 1000),
    related_federations: sanitizeFederations(source.related_federations),
  };
}

function sanitizeFederations(raw) {
  const values = Array.isArray(raw) ? raw : [];
  const out = [];
  values.forEach((value) => {
    const canonical = canonicalFederation(value);
    if (!canonical || out.indexOf(canonical) >= 0) return;
    out.push(canonical);
  });
  return out;
}

function canonicalFederation(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'africa') return 'Africa';
  if (normalized === 'arab') return 'Arab';
  if (normalized === 'asia-pacific' || normalized === 'asia pacific') return 'Asia-Pacific';
  if (normalized === 'european' || normalized === 'europe') return 'European';
  if (normalized === 'interamerican' || normalized === 'inter-american') return 'Interamerican';
  if (normalized === 'wosm') return 'WOSM';
  if (normalized === 'unclassified' || normalized === '미분류') return 'Unclassified';
  return ALLOWED_FEDERATIONS.indexOf(raw) >= 0 ? raw : '';
}

function cleanText(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, max);
}

function cleanUrl(value, max) {
  const text = String(value || '').trim().slice(0, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
