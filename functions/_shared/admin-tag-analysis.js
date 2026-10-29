import { queryRust } from './rust-server.js';
import { shiftAnalyticsDate } from './admin-analytics-range.js';

// Same published population and KST boundary for summary and Admin drilldown.
export async function queryTagAnalysisPosts(env, range, tag = null, pagination = null) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-tag-posts', {
    start: range ? range.startDate + ' 00:00:00' : null,
    end: range ? shiftAnalyticsDate(range.endDate, 1) + ' 00:00:00' : null,
    tag, pagination,
  });
  if (!response.ok) throw new Error('Rust tag analysis query failed');
  const result = await response.json();
  return pagination ? result : result.posts || [];
}
