import assert from 'node:assert/strict';
import { buildAnalyticsResponse } from './fixtures/analytics-response.js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { aggregateTags } from './fixtures/analytics-tags.js';
import { aggregateReferrers } from './fixtures/analytics-referrers.js';

const input={
  range:{startDate:'2026-10-01',endDate:'2026-10-02',label:'합성 기간',days:2},useHourlySeries:false,
  todayVisits:0,todayViews:1,totalPosts:2,publishedPosts:1,totalVisits:3,totalViews:5,averageDwellSeconds:6.2,
  seriesData:{unique:2,range_views:4,visit_series:[{date:'2026-10-01',visits:2}],view_series:[{date:'2026-10-01',views:4}],average_daily_visits:1.5,average_daily_pageviews:2},
  topPaths:{results:[{path:'/post/1',title:'합성 기사',visits:2,pageviews:4,avg_dwell_seconds:3.5},{path:'',title:'',visits:0,pageviews:0,avg_dwell_seconds:null}]},
  topArticlePosts:{results:[{path:'/post/1',title:'',visits:2,pageviews:4,avg_dwell_seconds:3.5}]},
  popularPostDwellRow:{title:'합성 기사',avg_dwell_seconds:3.5},referrerRows:[],tagRows:[],tagLabel:'합성 기간',heatmap:{cells:[]},
};
for (const data of [input,{...input,useHourlySeries:true,popularPostDwellRow:null,topPaths:{results:[]},topArticlePosts:{results:[]}}]) {
  const response=await queryRust({env:{},request:new Request('https://synthetic.invalid/')},'analytics-response',data);
  assert.equal(response.status,200);
  const referrers=aggregateReferrers(data.referrerRows);
  const sources=referrers.map(item=>({referrer_host:item.source_label||item.source_key||'직접',visits:item.visits||0,pageviews:item.pageviews||0,source_key:item.source_key||'',source_label:item.source_label||''}));
  const expected={...data,referrerSummary:{referrers,sources},tagSummary:aggregateTags(data.tagRows,{label:data.tagLabel})};
  assert.deepEqual(await response.json(),buildAnalyticsResponse(expected));
}
