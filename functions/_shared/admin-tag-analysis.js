import { PUBLIC_DATE_EXPR } from './post-public-date.js';
import { shiftAnalyticsDate } from './admin-analytics-range.js';

// Same published population and KST boundary for summary and Admin drilldown.
export async function queryTagAnalysisPosts(env, range, tag = null) {
  let sql = `SELECT id, category, title, subtitle, tag, meta_tags, special_feature, published, publish_at, created_at, updated_at, views FROM posts WHERE published = 1`;
  const args = [];
  if (range) {
    sql += ` AND (${PUBLIC_DATE_EXPR}) >= datetime(?) AND (${PUBLIC_DATE_EXPR}) < datetime(?)`;
    args.push(range.startDate + ' 00:00:00', shiftAnalyticsDate(range.endDate, 1) + ' 00:00:00');
  }
  if (tag != null) {
    sql += ` AND instr(COALESCE(meta_tags, ''), ?) > 0`;
    args.push(tag);
  }
  sql += ` ORDER BY (${PUBLIC_DATE_EXPR}) DESC, id DESC`;
  const stmt = env.DB.prepare(sql);
  const { results } = await (args.length ? stmt.bind(...args).all() : stmt.all());
  return results || [];
}
