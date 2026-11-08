import assert from 'node:assert/strict';
import { aggregateTags } from './fixtures/analytics-tags.js';
import { queryRust } from '../functions/_shared/rust-server.js';

const rows = [
  {id:1,title:'합성 글',category:'korea',published:1,tag:'캠프, Scout, 캠프',meta_tags:'스카우트, scout',pageviews:5},
  {id:2,title:'둘째',category:'apr',published:0,tag:'SCOUT, 야영',meta_tags:'캠프',pageviews:2},
  {id:3,title:'셋째',category:'wosm',published:1,tag:'야영,Camp',meta_tags:'스카우트',pageviews:5},
  {id:4,title:'빈 태그',category:'people',published:1,tag:'',meta_tags:null,pageviews:10},
  {id:5,title:'공백 경계',category:'korea',published:1,tag:'\ufeff 경계 \ufeff,\u0085',meta_tags:'경계',pageviews:0},
  {id:6,title:'대소문자 경계',category:'apr',published:1,tag:'ΟΣ, ος',meta_tags:'Σ, σ',pageviews:3},
  ...Array.from({length:90},(_,i)=>({id:100+i,title:`합성 ${i}`,category:i%2?'korea':'apr',published:i%2,tag:`태그${i}`,meta_tags:i%2?'공통, 야영':'공통, CAMP',pageviews:i%7})),
];
for (const input of [[], rows.slice(0,4), rows]) {
  const response=await queryRust({env:{},request:new Request('https://synthetic.invalid/')},'analytics-tag-aggregate',{rows:input,label:'합성 기간'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),aggregateTags(input,{label:'합성 기간'}));
}
