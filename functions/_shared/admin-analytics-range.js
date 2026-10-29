import { resolveAnalyticsRange } from './cloudflare-analytics.js';
import { queryRust } from './rust-server.js';

export async function resolveAdminAnalyticsRangeRust(params, env, options = {}, run=queryRust) {
  let result;
  try {
    const {prefix='',days=30,allowAll=false,defaultAll=false}=options;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
    const response=await run({env,request:{url:'https://internal.invalid/'}},'admin-analytics-range',{
      start:params.get(prefix+'start'),end:params.get(prefix+'end'),days:params.get(prefix+'days'),all:params.get(prefix+'all'),defaultDays:days,allowAll,defaultAll,today,
    });
    if (!response.ok) throw new Error('Rust analytics range failed');
    result=await response.json();
    if (result.fallback === true) return resolveAdminAnalyticsRange(params,options);
    if (typeof result.error === 'string') throw new RangeError(result.error);
    const range=result.range;
    if (range !== null && (!range || typeof range.startDate !== 'string' || typeof range.endDate !== 'string' || typeof range.label !== 'string' || typeof range.startUtcIso !== 'string' || typeof range.endUtcIso !== 'string' || !Number.isInteger(range.days))) throw new Error('Invalid Rust analytics range');
    return range;
  } catch (error) {
    if (error instanceof RangeError) throw error;
    return resolveAdminAnalyticsRange(params,options);
  }
}

// Admin-only calendar ranges. Public reporting contracts keep their existing helper.
export function resolveAdminAnalyticsRange(params, { prefix = '', days = 30, allowAll = false, defaultAll = false } = {}) {
  const start = params.get(prefix + 'start');
  const end = params.get(prefix + 'end');
  const requestedDays = params.get(prefix + 'days');
  if (start || end) {
    if (!validDate(start) || !validDate(end)) throw new RangeError('시작일과 종료일을 모두 올바른 날짜로 입력해주세요.');
    return resolveAnalyticsRange(start, end);
  }
  if (!requestedDays && allowAll && (params.get(prefix + 'all') === '1' || defaultAll)) return null;
  const n = requestedDays == null ? days : Number(requestedDays);
  if (!Number.isInteger(n) || n < 1) throw new RangeError('조회 기간은 1일 이상의 정수로 입력해주세요.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return resolveAnalyticsRange(shiftAnalyticsDate(today, -(Math.min(180, n) - 1)), today);
}

export function shiftAnalyticsDate(value, days) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function analyticsRangeMeta(range) {
  return range ? { start_date: range.startDate, end_date: range.endDate, label: range.label, days: range.days, timezone: 'Asia/Seoul' }
    : { start_date: null, end_date: null, label: '전체 기간', days: null, timezone: 'Asia/Seoul' };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
