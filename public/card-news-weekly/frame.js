const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bounded=(value,min,max,fallback)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const COVER_VARIANTS=['classic','editorial','panorama','mosaic','diagonal','poster','stacked','focus'];
const STORY_LAYOUTS=['wide','split-left','split-right','portrait'];
const brand='<div class="brand"><img src="/img/logo.png" alt="">BP미디어</div>';
const head=`<div class="top">${brand}<span class="series">WEEKLY BRIEF</span></div><div class="rule stitch-rule"></div>`;
const asset='/card-news-weekly/assets/world-scouting/';
const shape=(name,cls)=>`<img class="shape ${cls}" src="${asset}WorldScoutingShapes-${name}.png" alt="" aria-hidden="true">`;
let currentIssue=null,cardTotal=8,renderGeneration=0;
const initialRenderId=Number(new URLSearchParams(location.search).get('renderId')||0);window.currentRenderId=Number.isSafeInteger(initialRenderId)&&initialRenderId>=0?initialRenderId:0;
const foot=n=>`<div class="foot"><span>bpmedia.net · ${esc(currentIssue?.date||'')}</span><span class="page-num">${String(n).padStart(2,'0')} / ${String(cardTotal).padStart(2,'0')}</span></div>`;
function weekTag(date){const d=new Date(String(date).slice(0,10).replaceAll('.','-')+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(),week=Math.ceil((((d-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);return `<span class="week-tag">${year}년 ${week}주차</span>`;}
function photo(a){return `<figure class="photo-wrap"><img src="${esc(a.image)}" alt="${esc(a.original_title)}"><figcaption class="credit">${esc(a.credit)}</figcaption></figure>`;}
function story(a,i){
  const config=currentIssue.design?.articles?.[a.id],custom=config&&typeof config==='object';
  const layout=STORY_LAYOUTS.includes(config?.layout)?config.layout:'wide';
  const style=custom?`--title-size:${bounded(config.title_size,44,72,58)}px;--body-size:${bounded(config.body_size,24,36,31)}px;--image-height:${bounded(config.image_height,260,560,390)}px;--image-fit:${config.image_fit==='contain'?'contain':'cover'}`:'';
  const summary=`<div class="summary"><span class="excerpt">${esc(a.summary)}</span><a class="readmore" href="${esc(a.url)}" target="_blank" rel="noopener">BP미디어에서 자세히 확인하기 →</a></div>`;
  let content;
  if(custom)content=`<div class="story-main">${photo(a)}${summary}</div>`;
  else if(a.mode==='poster'||a.mode==='portrait')content=`<div class="${a.mode}-main">${photo(a)}${summary}</div>`;
  else content=photo(a)+summary;
  const category=a.header_category==='한국소식'?'korea':a.header_category==='아태소식'?'apr':a.header_category==='세계소식'?'world':'people';
  return `<article class="card ${custom?'custom-story layout-'+layout:esc(a.mode||'photo')} category-${category}" style="${style}" data-card="${i+1}" data-article-id="${a.id}">${head.replace('WEEKLY BRIEF','기사 #'+a.id)}<div class="kicker"><span class="header-category">${esc(a.header_category)}</span></div><h2 class="title">${esc(a.title)}</h2><div class="article-tags">${(a.display_tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div><h3 class="subtitle">${esc(a.subtitle)}</h3>${content}<div class="note">${esc(a.note)}</div>${foot(i+2)}</article>`;
}
function cover(issue){
  const design=issue.design||{},variant=COVER_VARIANTS.includes(design.cover_variant)?design.cover_variant:'classic';
  const title=typeof design.cover_title==='string'&&design.cover_title.trim()?design.cover_title:'이번 주\n스카우트 소식';
  const subtitle=typeof design.cover_subtitle==='string'?design.cover_subtitle:'세계의 스카우트는 지금?';
  return `<article class="card cover cover-variant-${variant}" style="--cover-title-size:${bounded(design.cover_title_size,88,120,111)}px" data-card="0">${shape('05','cover-arc')}${shape('02','cover-diamond')}${head}<div class="date">${weekTag(issue.date)}<span class="date-range">${esc(issue.period.start.slice(0,10).replaceAll('-','.')+'–'+issue.period.end.slice(0,10).replaceAll('-','.'))} · 한 주의 기록</span></div><h1>${esc(title).replace(/\r?\n/g,'<br>')}</h1><p class="cover-sub">${esc(subtitle).replace(/\r?\n/g,'<br>')}</p><div class="cover-collage"><img src="${esc(issue.articles[0].image)}" alt="이번 호의 기사 사진"><div class="small"><img src="${esc((issue.articles[1]||issue.articles[0]).image)}" alt="함께 읽을 소식의 사진"><img class="portrait-thumb" src="${esc((issue.articles[2]||issue.articles[0]).image)}" alt="함께 읽을 소식의 사진"></div></div><div class="cover-bottom"><span class="cover-count"><b>${issue.articles.length}</b>가지 이야기</span><span>옆으로 넘겨 읽어보세요 →</span></div>${foot(1)}</article>`;
}
function ending(){return `<article class="card ending" data-card="${cardTotal-1}">${head}<div class="date" style="font-size:27px;margin-top:14px">스카우트 소식과 활동의 기록</div><h2>세계의 스카우트 소식,<br><span>한곳에서 만나보세요.</span></h2><p>국경을 넘어 전해지는 도전과 경험,<br>다른 나라의 스카우트 프로그램에서<br>우리 활동에 쓸 아이디어를 찾아보세요.</p><div class="url-box"><strong>bpmedia.net</strong><span class="cta-arrow"><img src="${asset}WorldScoutingShapes-06.png" alt=""></span></div><p class="cta-caption">스카우트 소식과 프로그램 아이디어를 만나보세요.</p><div class="seal"><img src="/img/logo.png" alt=""><p>세계의 소식을 가까이,<br>새로운 활동의 영감을 우리 곁에.</p></div>${foot(cardTotal)}</article>`;}
function roundup(groups){return `<article class="card roundup mixed-roundup" data-card="${currentIssue.articles.length+1}">${head.replace('WEEKLY BRIEF','더 읽을 소식')}<div class="roundup-label">이번 카드에 담지 못한 최근 기사</div><h2 class="title">이번 주, 더 읽어볼 소식</h2><div class="mixed-groups">${groups.map(g=>`<section class="mixed-group category-${esc(g.category)}"><h3 class="mixed-category">${esc(g.label)}</h3><ol>${g.articles.slice(0,4).map(a=>`<li><a href="${esc(a.url)}" target="_blank" rel="noopener"><span class="mixed-id">#${a.id}</span><span class="mixed-title">${esc(a.title)}</span></a></li>`).join('')}</ol></section>`).join('')}</div><p class="roundup-cta">기사 전문과 더 많은 소식은 BP미디어에서.</p>${foot(currentIssue.articles.length+2)}</article>`;}
window.fitCardText=function(){
  const coverTitle=document.querySelector('.cover h1');
  if(coverTitle)while(coverTitle.scrollHeight>coverTitle.clientHeight+1&&parseFloat(getComputedStyle(coverTitle).fontSize)>58)coverTitle.style.fontSize=(parseFloat(getComputedStyle(coverTitle).fontSize)-2)+'px';
  const coverSubtitle=document.querySelector('.cover-sub');if(coverSubtitle)while(coverSubtitle.scrollHeight>coverSubtitle.clientHeight+1&&parseFloat(getComputedStyle(coverSubtitle).fontSize)>22)coverSubtitle.style.fontSize=(parseFloat(getComputedStyle(coverSubtitle).fontSize)-1)+'px';
  for(const card of document.querySelectorAll('.card:not(.cover):not(.ending):not(.roundup)')){
    let bottom=card.querySelector('.story-bottom');
    if(!bottom){bottom=document.createElement('div');bottom.className='story-bottom';const link=card.querySelector('.readmore'),note=card.querySelector('.note');if(link)bottom.append(link);if(note)bottom.append(note);card.append(bottom);}
    const excerpt=card.querySelector('.excerpt');if(!excerpt)continue;
    if(!excerpt.dataset.fullText)excerpt.dataset.fullText=excerpt.textContent;
    const sentences=excerpt.dataset.fullText.split(/(?<=[.!?])\s+/);excerpt.textContent=sentences.join(' ');
    const title=card.querySelector('.title');while(title&&title.offsetHeight>210&&parseFloat(getComputedStyle(title).fontSize)>42)title.style.fontSize=(parseFloat(getComputedStyle(title).fontSize)-2)+'px';
    const figure=card.querySelector('.photo-wrap'),image=figure?.querySelector('img'),viewport=figure?.querySelector('.photo-viewport');
    if(figure&&image){
      const stacked=card.classList.contains('layout-wide')||(!card.classList.contains('custom-story')&&!card.querySelector('.poster-main,.portrait-main'));
      const credit=figure.querySelector('.credit'),reserve=stacked?Math.min(112,parseFloat(getComputedStyle(excerpt.parentElement).fontSize)*3.14)+24:0;
      const available=Math.max(120,bottom.getBoundingClientRect().top-18-figure.getBoundingClientRect().top-(credit?.offsetHeight||0)-10-reserve);
      const target=viewport||image;if(target.getBoundingClientRect().height>available)target.style.height=available+'px';
    }
    const summary=card.querySelector('.summary');
    while(summary.getBoundingClientRect().bottom>bottom.getBoundingClientRect().top-18&&sentences.length){sentences.pop();excerpt.textContent=sentences.join(' ');}
    card.dataset.excerptTrimmed=String(excerpt.textContent!==excerpt.dataset.fullText);
  }
};
async function render(){
  const generation=++renderGeneration,renderId=window.currentRenderId;
  try{
  const id=new URLSearchParams(location.search).get('issue');if(!/^\d+$/.test(id||''))throw new Error('카드뉴스를 다시 열어 주세요.');
  const issue=window.EMBEDDED_ISSUE||await fetch('/api/admin/card-news/'+id,{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('카드뉴스를 불러오지 못했습니다. 다시 열어 주세요.');return r.json()}).then(d=>d.data);
  if(generation!==renderGeneration)return;currentIssue=issue;window.currentIssue=issue;if(!issue.articles?.length)throw new Error('이미지가 있는 기사가 없습니다.');
  const groups=(issue.additional_news||[]).filter(g=>Array.isArray(g.articles)&&g.articles.length);cardTotal=issue.articles.length+(groups.length?1:0)+2;
  const all=[cover(issue),...issue.articles.map(story),...(groups.length?[roundup(groups)]:[]),ending()];
  const requested=window.currentCard??new URLSearchParams(location.search).get('card'),raw=requested===null?null:String(requested);
  if(raw!==null&&(!/^\d$/.test(raw)||Number(raw)>=all.length))throw new Error('올바르지 않은 카드 번호입니다.');
  window.currentCard=raw===null?null:Number(raw);
  document.querySelector('#cards').innerHTML=DOMPurify.sanitize(raw===null?all.join(''):all[Number(raw)],{ADD_ATTR:['target','data-card','data-article-id']});
  await document.fonts.ready;await Promise.all([...document.querySelectorAll('#cards img')].map(im=>im.decode()));
  if(generation!==renderGeneration)return;window.fitCardText();window.renderReady=true;window.dispatchEvent(new CustomEvent('card-ready',{detail:{renderId}}));
  }catch(error){if(generation!==renderGeneration)return;throw error;}
}
function showFailure(error){document.querySelector('#cards').textContent=error.message;window.renderError=error.message;window.parent.postMessage({type:'bp-card-error',message:error.message},location.origin);}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='bp-set-issue')return;window.EMBEDDED_ISSUE=e.data.issue;if(Number.isSafeInteger(e.data.renderId)&&e.data.renderId>=0)window.currentRenderId=e.data.renderId;if(Number.isInteger(e.data.card))window.currentCard=e.data.card;window.renderReady=false;render().catch(showFailure);});
render().catch(showFailure);
