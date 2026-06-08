/* DreamPath Document Templates — Tweaks (global + per-document options) */
const TPL_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "importance": "standard",
  "showStar": true,
  "density": "comfortable",
  "paper": "white",
  "showFooter": true,
  "pages": "1",
  "letterDelivery": "By email",
  "pressRelease": "immediate",
  "embargoDate": "15 July 2026",
  "weeklyStatus": "ontrack",
  "approvalDecision": "pending",
  "briefStatus": "inprogress",
  "generalStatus": "inreview",
  "minutesStatus": "none",
  "coverType": "",
  "coverConfidential": true,
  "certType": "completion",
  "certSeal": true,
  "envSize": "dl",
  "envWindow": false
}/*EDITMODE-END*/;

const STAR_TONE = { standard:'#1E1654', important:'#6B2DBE', priority:'#F4B72E' };
const TONE_IMP = { '#1e1654':'standard', '#6b2dbe':'important', '#f4b72e':'priority' };
const DOC_LABEL = {
  guide:'Format Guide', letterhead:'Official Letter', press:'Press Release', weekly:'Weekly Report',
  brief:'Project Brief', minutes:'Meeting Minutes', general:'General Document',
  'cover-p':'Cover (Portrait)', 'cover-l':'Cover (Landscape)',
  envelope:'Envelope', card:'Business Card', sig:'Email Signature'
};

function DocOptions({ target, t, setTweak }){
  switch(target){
    case 'letterhead': return (
      <TweakSelect label="Delivery method" value={t.letterDelivery}
        options={['By email','By post','By hand','By courier','By registered post']}
        onChange={(v)=>setTweak('letterDelivery', v)} />
    );
    case 'press': return (
      <>
        <TweakRadio label="Release" value={t.pressRelease}
          options={[{value:'immediate',label:'Immediate'},{value:'embargo',label:'Embargoed'}]}
          onChange={(v)=>setTweak('pressRelease', v)} />
        {t.pressRelease==='embargo' &&
          <TweakText label="Embargo until" value={t.embargoDate}
            onChange={(v)=>setTweak('embargoDate', v)} />}
      </>
    );
    case 'weekly': return (
      <TweakRadio label="Overall status" value={t.weeklyStatus}
        options={[{value:'ontrack',label:'On track'},{value:'atrisk',label:'At risk'},{value:'delayed',label:'Delayed'}]}
        onChange={(v)=>setTweak('weeklyStatus', v)} />
    );
    case 'brief': return (
      <TweakSelect label="Project status" value={t.briefStatus}
        options={[{value:'inprogress',label:'In progress'},{value:'planned',label:'Planned'},{value:'complete',label:'Complete'}]}
        onChange={(v)=>setTweak('briefStatus', v)} />
    );
    case 'general': return (
      <TweakSelect label="Review status" value={t.generalStatus}
        options={[{value:'draft',label:'Draft'},{value:'inreview',label:'In review'},{value:'reviewed',label:'Reviewed'},{value:'approved',label:'Approved'}]}
        onChange={(v)=>setTweak('generalStatus', v)} />
    );
    case 'minutes': return (
      <TweakRadio label="Stamp" value={t.minutesStatus}
        options={[{value:'none',label:'None'},{value:'draft',label:'Draft'},{value:'approved',label:'Approved'}]}
        onChange={(v)=>setTweak('minutesStatus', v)} />
    );
    case 'cover-p':
    case 'cover-l': return (
      <>
        <TweakSelect label="Document type" value={t.coverType}
          options={[{value:'',label:'Keep current'},{value:'Partnership Proposal',label:'Partnership Proposal'},{value:'Report',label:'Report'},{value:'Program Brief',label:'Program Brief'},{value:'Operating Plan',label:'Operating Plan'},{value:'Memorandum of Understanding',label:'Memo of Understanding'}]}
          onChange={(v)=>setTweak('coverType', v)} />
        <TweakToggle label="Show confidential mark" value={t.coverConfidential}
          onChange={(v)=>setTweak('coverConfidential', v)} />
      </>
    );
    case 'envelope': return (
      <>
        <TweakRadio label="Size" value={t.envSize}
          options={[{value:'dl',label:'DL'},{value:'c5',label:'C5'},{value:'c4',label:'C4'}]}
          onChange={(v)=>setTweak('envSize', v)} />
        <TweakToggle label="Window panel" value={t.envWindow}
          onChange={(v)=>setTweak('envWindow', v)} />
      </>
    );
    default: return (
      <div style={{fontSize:'11px',color:'rgba(41,38,27,.5)',lineHeight:1.5}}>
        Edit fields directly on the card. No extra options for this item.
      </div>
    );
  }
}

function TplTweaksApp(){
  const [t, setTweak] = useTweaks(TPL_TWEAK_DEFAULTS);
  const [target, setTarget] = React.useState((window.DPState && window.DPState.target) || 'guide');

  React.useEffect(() => { if (window.applyTweaks) window.applyTweaks(t); }, [t, target]);
  React.useEffect(() => {
    const onTpl = (e) => setTarget(e.detail);
    window.addEventListener('tplchange', onTpl);
    return () => window.removeEventListener('tplchange', onTpl);
  }, []);

  const dl = () => { if (window.DPExport) window.DPExport.toWord((window.DPState && window.DPState.target) || target); };
  const pdf = () => window.print();
  const paper = ['letterhead','press','weekly','brief','minutes','general'].indexOf(target) >= 0;

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label={'This document — ' + (DOC_LABEL[target] || '')} />
      {paper &&
        <TweakRadio label="Length" value={t.pages || '1'}
          options={[{value:'1',label:'1 page'},{value:'2',label:'2 pages'}]}
          onChange={(v)=>setTweak('pages', v)} />}
      <DocOptions target={target} t={t} setTweak={setTweak} />

      <TweakSection label="Download" />
      <div style={{display:'flex', gap:'6px'}}>
        <TweakButton label="Save .doc" onClick={dl} />
        <TweakButton label="Save PDF" onClick={pdf} secondary />
      </div>

      <TweakSection label="Importance (all documents)" />
      <TweakRadio label="Level" value={t.importance}
        options={[{value:'standard',label:'Standard'},{value:'important',label:'Important'},{value:'priority',label:'Priority'}]}
        onChange={(v)=>setTweak('importance', v)} />
      <TweakColor label="Star tone" value={STAR_TONE[t.importance]}
        options={['#1E1654','#6B2DBE','#F4B72E']}
        onChange={(hex)=>setTweak('importance', TONE_IMP[String(hex).toLowerCase()] || 'standard')} />
      <TweakToggle label="Show star classification" value={t.showStar}
        onChange={(v)=>setTweak('showStar', v)} />

      <TweakSection label="Layout (all documents)" />
      <TweakRadio label="Density" value={t.density}
        options={[{value:'comfortable',label:'Comfortable'},{value:'compact',label:'Compact'}]}
        onChange={(v)=>setTweak('density', v)} />
      <TweakRadio label="Paper" value={t.paper}
        options={[{value:'white',label:'White'},{value:'warm',label:'Warm'}]}
        onChange={(v)=>setTweak('paper', v)} />
      <TweakToggle label="Show footer" value={t.showFooter}
        onChange={(v)=>setTweak('showFooter', v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<TplTweaksApp />);
