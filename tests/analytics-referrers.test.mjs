import assert from 'node:assert/strict';
import { aggregateReferrers } from './fixtures/analytics-referrers.js';
import { queryRust } from '../functions/_shared/rust-server.js';

const hosts=['','direct','internal','unknown','story.kakao.com','open.kakao.com','search.naver.com','naver.com','www.google.com','search.daum.net','daum.net','bing.com','instagram.com','facebook.com','t.co','x.com','threads.net','youtube.com','youtu.be','linkedin.com','lnkd.in','line.me','whatsapp.com','t.me','telegram.org','discord.com','reddit.com','band.us','sub.example.org','sub.another.net'];
const rows=hosts.map((host,i)=>({referrer_host:host,referrer_url:host?`https://${host}/${i%2?'search':'home'}`:null,utm_source:null,utm_medium:null,utm_campaign:null,visits:(i%4)+1,pageviews:(i%6)+1}));
rows.push(...['kakaotalk','facebook','copy','campaignx'].flatMap((source,i)=>[
  {referrer_host:'example.invalid',referrer_url:null,utm_source:source,utm_medium:'social-share',utm_campaign:'Autumn',visits:i+1,pageviews:i+2},
  {referrer_host:'example.invalid',referrer_url:null,utm_source:source,utm_medium:'email',utm_campaign:'Spring',visits:2,pageviews:3},
]));
for (const input of [[],rows.slice(0,12),rows,rows.slice().reverse()]) {
  const response=await queryRust({env:{},request:new Request('https://synthetic.invalid/')},'analytics-referrer-aggregate',{rows:input});
  assert.equal(response.status,200);
  const referrers=aggregateReferrers(input);
  const sources=referrers.map(item=>({referrer_host:item.source_label||item.source_key||'직접',visits:item.visits||0,pageviews:item.pageviews||0,source_key:item.source_key||'',source_label:item.source_label||''}));
  assert.deepEqual(await response.json(),{referrers,sources});
}
