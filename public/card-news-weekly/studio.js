(()=>{
'use strict';
const id=Number(document.body.dataset.issueId),canWrite=document.body.dataset.canWrite==='1';
const $=s=>document.querySelector(s),frame=$('#preview'),pending=new Map();
let issue,active=0,dirty=false,saving=false,busy=false,ready=false,sentDraft=false,requestId=0,localRevision=0;
const status=text=>$('#status').textContent=text;
function notify(type){if(parent!==window)parent.postMessage({type,id},location.origin);}
function changed(){dirty=true;localRevision++;notify('__edit_mode_set_keys');status('변경 내용을 살펴보신 뒤 저장해 주세요.');}
function selected(next,ids){
  const articles=ids.map(id=>next.candidates.find(a=>a.id===id));
  return {...next,articles,additional_news:['korea','apr','wosm'].map(c=>({category:c==='wosm'?'world':c,label:{korea:'한국소식',apr:'아태소식',wosm:'세계소식'}[c],articles:next.candidates.filter(a=>a.category===c&&!ids.includes(a.id)).slice(0,4).map(a=>({id:a.id,title:a.original_title,url:a.url}))}))};
}
function cardNames(){return ['표지',...issue.articles.map(a=>a.title),...(issue.additional_news.some(g=>g.articles.length)?['더 읽어볼 소식']:[]),'세계의 스카우트 소식'];}
function locked(){return saving||busy;}
function controls(){
  for(const b of document.querySelectorAll('button'))b.disabled=locked();
  $('#prev').disabled=locked()||active===0;$('#next').disabled=locked()||active===cardNames().length-1;
  $('#choose').hidden=!canWrite;$('#save').hidden=!canWrite;$('#save').disabled=locked()||!dirty;
}
function thumbnails(){const nav=$('#thumbs');nav.replaceChildren();cardNames().forEach((name,i)=>{const b=document.createElement('button');b.type='button';b.textContent=String(i+1).padStart(2,'0')+' · '+name;b.setAttribute('aria-current',i===active?'true':'false');b.onclick=()=>{if(!locked())show(i)};nav.append(b);});}
function show(n){active=Math.max(0,Math.min(cardNames().length-1,n));ready=false;sentDraft=false;frame.src=`/card-news/${id}/frame?issue=${id}&card=${active}&edit=${canWrite?'1':'0'}`;$('#counter').textContent=`${active+1} / ${cardNames().length}`;thumbnails();controls();}
new ResizeObserver(()=>{frame.style.transform=`scale(${$('main>section').clientWidth/1080})`}).observe($('#viewport'));
$('#prev').onclick=()=>show(active-1);$('#next').onclick=()=>show(active+1);
window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  if(e.source===frame.contentWindow){
    if(e.data?.type==='bp-card-ready'){
      if(!sentDraft){sentDraft=true;frame.contentWindow.postMessage({type:'bp-set-issue',issue:structuredClone(issue)},location.origin);}
      else ready=true;
    }
    if(e.data?.type==='bp-card-error'){ready=false;status(e.data.message+' 다른 카드를 골라 보시거나 다시 열어 주세요.');}
    if(e.data?.type==='bp-photo-changed'&&canWrite){issue.photo_views=e.data.views;changed();controls();}
  }
  if(e.data?.type==='bp-export-result'){
    const p=pending.get(e.data.id);if(!p||p.source!==e.source)return;
    clearTimeout(p.timer);pending.delete(e.data.id);
    if(e.data.blob instanceof Blob)p.resolve(e.data.blob);else p.reject(new Error(e.data.error||'이미지를 준비하지 못했습니다.'));
  }
});
function waitForReady(){return new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{if(ready){clearInterval(timer);resolve();}else if(Date.now()-start>30000){clearInterval(timer);reject(new Error('카드를 불러오는 데 시간이 걸립니다. 다시 열어 주세요.'));}},100);});}
function capture(target){return new Promise((resolve,reject)=>{const n=++requestId,timer=setTimeout(()=>{pending.delete(n);reject(new Error('이미지를 준비하는 데 시간이 걸립니다. 다시 시도해 주세요.'));},45000);pending.set(n,{source:target.contentWindow,resolve,reject,timer});target.contentWindow.postMessage({type:'bp-export-card',id:n},location.origin);});}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('#png').onclick=async()=>{if(locked())return;busy=true;controls();status('지금 보시는 카드를 준비하고 있습니다.');try{await waitForReady();download(await capture(frame),`BPmedia_${issue.date}_${String(active+1).padStart(2,'0')}.png`);status('PNG를 준비했습니다. 함께 나누실 때 활용해 주세요.');}catch(error){status(error.message)}finally{busy=false;controls()}};
$('#zip').onclick=async()=>{
  if(locked())return;busy=true;controls();
  const worker=document.createElement('iframe');worker.title='전체 카드 이미지 준비';worker.style.cssText='position:fixed;left:-12000px;top:0;width:1080px;height:1350px';document.body.append(worker);
  try{
    const zip=new JSZip(),snapshot=structuredClone(issue);
    for(let i=0;i<cardNames().length;i++){
      status(`카드를 차례로 준비하고 있습니다. ${i+1} / ${cardNames().length}`);
      await new Promise((resolve,reject)=>{
        let sent=false;
        const stop=()=>window.removeEventListener('message',listen);
        const timer=setTimeout(()=>{stop();reject(new Error('카드를 준비하지 못했습니다. 다시 시도해 주세요.'));},30000);
        function listen(e){if(e.origin!==location.origin||e.source!==worker.contentWindow)return;if(e.data?.type==='bp-card-error'){clearTimeout(timer);stop();reject(new Error(e.data.message));}if(e.data?.type!=='bp-card-ready')return;if(!sent){sent=true;worker.contentWindow.postMessage({type:'bp-set-issue',issue:snapshot},location.origin);}else{clearTimeout(timer);stop();resolve();}}
        window.addEventListener('message',listen);worker.src=`/card-news/${id}/frame?issue=${id}&card=${i}&edit=0`;
      });
      zip.file(`BPmedia_${String(i+1).padStart(2,'0')}.png`,await capture(worker));
    }
    download(await zip.generateAsync({type:'blob'}),`BPmedia_${issue.date}.zip`);status('전체 PNG를 준비했습니다. 필요한 곳에 보관해 주세요.');
  }catch(error){status(error.message)}finally{worker.remove();busy=false;controls()}
};
$('#choose').onclick=()=>{
  if(!canWrite||locked())return;const choices=$('#choices');choices.replaceChildren();
  for(const a of issue.candidates){const label=document.createElement('label');label.className='choice';const check=document.createElement('input');check.type='checkbox';check.value=a.id;check.checked=issue.articles.some(x=>x.id===a.id);const img=document.createElement('img');img.src=a.image;img.alt='';const span=document.createElement('span');span.textContent=a.original_title;const small=document.createElement('small');small.textContent=a.header_category+' · 기사 #'+a.id;span.append(small);label.append(check,img,span);choices.append(label);}
  $('#choice-status').textContent='';$('#picker').showModal();
};
$('#cancel-picker').onclick=()=>$('#picker').close();
$('#apply-picker').onclick=()=>{const ids=[...document.querySelectorAll('#choices input:checked')].map(x=>Number(x.value));if(ids.length<1||ids.length>5){$('#choice-status').textContent='함께 읽을 기사 1~5건을 골라 주세요.';return;}issue=selected(issue,ids);changed();$('#picker').close();show(Math.min(active,cardNames().length-1));};
$('#save').onclick=async()=>{
  if(!canWrite||locked()||!dirty)return;saving=true;controls();const revision=localRevision;notify('__card_news_saving');status('고르신 기사와 사진 위치를 저장하고 있습니다.');
  try{const r=await fetch('/api/admin/card-news/'+id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:issue.revision,weekly:{selected_ids:issue.articles.map(a=>a.id),photo_views:issue.photo_views||{}}})});const d=await r.json();if(!r.ok)throw new Error(d.reason||'저장하지 못했습니다. 다시 살펴봐 주세요.');issue.revision=d.revision;dirty=localRevision!==revision;notify('__card_news_saved');status(dirty?'저장했습니다. 그 뒤의 변경은 한 번 더 저장해 주세요.':'저장했습니다. 다음에도 이어서 살펴보실 수 있습니다.');}
  catch(error){dirty=true;notify('__card_news_save_failed');status(error.message)}finally{saving=false;controls()}
};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
async function load(){if(!Number.isSafeInteger(id)||id<1)throw new Error('관리자 목록에서 카드뉴스를 열어 주세요.');const r=await fetch('/api/admin/card-news/'+id,{credentials:'same-origin'});if(!r.ok)throw new Error('카드뉴스를 불러오지 못했습니다. 관리자에서 다시 열어 주세요.');const row=await r.json();issue=row.data;if(issue.template!=='bpmedia-weekly-v1'||!issue.articles?.length)throw new Error('아직 준비된 카드가 없습니다.');$('#period').textContent=`${issue.period.start.slice(0,10)}–${issue.period.end.slice(0,10)} · 자동 게시 없이 함께 읽을 소식만 준비합니다.`;status(canWrite?'기사와 사진 위치를 편하게 살펴봐 주세요. 변경하신 내용은 저장 후 이어서 보실 수 있습니다.':'함께 읽을 소식을 준비했습니다. PNG로 내려받아 살펴보실 수 있습니다.');show(0);}
load().catch(error=>status(error.message));
})();
