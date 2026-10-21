import {INQUIRY_ENDPOINT} from './inquiry-config.js';
import {sendInquiry} from './inquiry-delivery.js';

(() => {
  const $ = s => document.querySelector(s);
  // Funnel events go through track.js and carry a fixed name only, never what
  // anyone typed. Each step is reported once per visit.
  const reportedSteps = new Set();
  const track = name => { try { window.mtTrack && window.mtTrack(name); } catch (e) {} };
  const stepEvents = {2:'inquiry-step:details',3:'inquiry-step:review'};
  const dialog = $('#inquiry');
  const panels = ['date','details','review','complete'];
  const months = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  const dateLabel = new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
  const shortDate = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  let selection = '', preferred = 'Flexible', step = 1, trigger, savedOverflow = '', sending = false;
  const iso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const date = str => new Date(`${str}T12:00:00Z`);
  // Email fallback. Carries whatever has been typed so far, so switching to
  // email after a failed send loses nothing. Mail clients and browsers cap
  // mailto URLs at around 2,000 characters, so the body is shortened from the
  // end (the message is last) on a word boundary, and says that it was.
  const MAILTO_ADDRESS = 'merttureli0@gmail.com', MAILTO_LIMIT = 1900;
  const MAILTO_NOTE = '\n\n[Shortened to fit an email link. The rest of the message did not fit.]';
  function mailtoHref(){
    const value=id=>$(`#${id}`).value.trim();
    const lines=[];
    if(value('name'))lines.push(`Name: ${value('name')}`);
    if(value('email'))lines.push(`Email: ${value('email')}`);
    if(value('company'))lines.push(`Company or website: ${value('company')}`);
    if(selection)lines.push(`Preferred day: ${dateLabel.format(date(selection))}, ${preferred}, ${$('#timezone').selectedOptions[0]?.textContent||$('#timezone').value}`);
    if(value('message'))lines.push('',value('message'));
    const head=`mailto:${MAILTO_ADDRESS}?subject=${encodeURIComponent('Website inquiry')}`;
    const build=text=>text?`${head}&body=${encodeURIComponent(text)}`:head;
    const body=lines.join('\n');
    if(build(body).length<=MAILTO_LIMIT)return build(body);
    // Code points, not UTF-16 units: cutting a surrogate pair would make
    // encodeURIComponent throw.
    const chars=Array.from(body);
    const cut=n=>{let text=chars.slice(0,n).join('');const space=text.search(/\s\S*$/);if(space>n*0.8)text=text.slice(0,space);return text.trimEnd()+' [...]'+MAILTO_NOTE;};
    let low=0,high=chars.length;
    while(low<high){const mid=Math.ceil((low+high)/2);if(build(cut(mid)).length<=MAILTO_LIMIT)low=mid;else high=mid-1;}
    return build(low?cut(low):'');
  }
  function refreshMailto(){
    const href=mailtoHref();
    document.querySelectorAll('[data-mailto-details]').forEach(a=>{a.href=href;});
  }
  function today(){
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:$('#timezone').value,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  let month = date(today());month.setUTCDate(1);
  function bounds(){const start=date(today());start.setUTCDate(1);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+6);return {start,end};}
  function calendar(focusDate){
    $('#month-label').textContent=months.format(month);
    const grid=$('#days');grid.replaceChildren();
    const offset=(month.getUTCDay()+6)%7;
    const count=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');grid.append(blank);}
    const current=today();
    for(let day=1;day<=count;day++){
      const d=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),day,12));const key=iso(d);
      const b=document.createElement('button');b.type='button';b.textContent=String(day);b.dataset.date=key;
      b.disabled=key<=current;b.setAttribute('aria-label',dateLabel.format(d));b.setAttribute('aria-pressed',String(key===selection));
      if(key===current)b.classList.add('today');
      b.addEventListener('click',()=>choose(key));
      b.addEventListener('keydown',e=>{
        const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
        if(!(e.key in moves))return;e.preventDefault();
        const target=new Date(d);target.setUTCDate(target.getUTCDate()+moves[e.key]);
        const {start,end}=bounds();if(iso(target)<=current||target<start||target>=end)return;
        month=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),1,12));calendar(iso(target));
      });
      grid.append(b);
    }
    const {start,end}=bounds();$('#prev-month').disabled=month.getUTCFullYear()===start.getUTCFullYear()&&month.getUTCMonth()===start.getUTCMonth();
    const following=new Date(month);following.setUTCMonth(following.getUTCMonth()+1);$('#next-month').disabled=following>=end;
    if(focusDate)grid.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }
  function choose(key){
    selection=key;$('#continue').disabled=false;$('#time-block').hidden=false;
    $('#chosen-date').textContent=shortDate.format(date(key));
    $('#days').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.date===key)));
    refreshMailto();
  }
  function go(next,focus=true){
    if(stepEvents[next]&&!reportedSteps.has(next)){reportedSteps.add(next);track(stepEvents[next]);}
    step=next;panels.forEach((p,i)=>{$(`#${p}-panel`).hidden=i!==next-1;});
    document.querySelectorAll('[data-step]').forEach(s=>{s.classList.toggle('active',Number(s.dataset.step)<=next);if(Number(s.dataset.step)===next)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');});
    $('#step-count').textContent=next===4?'REQUEST SENT':`${String(next).padStart(2,'0')} / 03`;
    if(focus){const heading=$(`#${panels[next-1]}-panel h3`);heading.tabIndex=-1;heading.focus({preventScroll:true});}
    dialog.scrollTop=0;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let closing = false;
  function resetPastDate(){
    if(selection && selection <= today()){
      selection='';$('#continue').disabled=true;$('#time-block').hidden=true;
      $('#chosen-date').textContent='Choose a day to begin.';
      refreshMailto();
    }
    const {start,end}=bounds();
    if(month<start || month>=end)month=start;
  }
  function open(button){
    if(dialog.open)return;
    if(step===4){
      $('#details-panel').reset();selection='';preferred='Flexible';step=1;
      $('#continue').disabled=true;$('#time-block').hidden=true;
      $('#chosen-date').textContent='Choose a day to begin.';
      $('#send-status').textContent='';$('#send-status').classList.remove('is-error');
      document.querySelectorAll('[data-time]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.time==='Flexible')));
      refreshMailto();
    }
    track('inquiry-open');
    trigger=button;resetPastDate();calendar();
    savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    go(!selection ? 1 : step,false);
    dialog.showModal();dialog.scrollTop=0;
    $('#close-inquiry').focus({preventScroll:true});
  }
  function close(){
    if(!dialog.open || closing)return;
    if(reduced.matches){dialog.close();return;}
    closing=true;dialog.classList.add('is-closing');
    const finish=()=>{if(!closing)return;closing=false;dialog.classList.remove('is-closing');dialog.close();};
    Promise.allSettled(dialog.getAnimations().map(a=>a.finished)).then(finish);
    setTimeout(finish,400);
  }
  document.querySelectorAll('[data-open-inquiry]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();open(b);}));
  $('#close-inquiry').onclick=close;$('#done').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{document.body.style.overflow=savedOverflow;trigger?.focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{
    if(e.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)close();
  });
  $('#prev-month').onclick=()=>{month.setUTCMonth(month.getUTCMonth()-1);calendar();};
  $('#next-month').onclick=()=>{month.setUTCMonth(month.getUTCMonth()+1);calendar();};
  $('#timezone').onchange=()=>{
    resetPastDate();calendar();refreshMailto();
  };
  document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{preferred=b.dataset.time;document.querySelectorAll('[data-time]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refreshMailto();});
  $('#continue').onclick=()=>{resetPastDate();if(selection)go(2);else calendar();};
  document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{if(!sending)go(Number(b.dataset.back));});
  $('#details-panel').addEventListener('submit',e=>{
    e.preventDefault();
    if(sending)return;
    for(const id of ['name','message']){const field=$(`#${id}`);field.setCustomValidity(field.value.trim()?'':'Please fill in this field.');if(!field.reportValidity())return;}
    if(!selection||selection<=today()){resetPastDate();calendar();go(1);return;}
    const rows=[['When',`${dateLabel.format(date(selection))}\n${preferred} / ${$('#timezone').selectedOptions[0].textContent}`],['Name',$('#name').value.trim()],['Email',$('#email').value.trim()]];
    if($('#company').value.trim())rows.push(['Project',$('#company').value.trim()]);rows.push(['Your idea',$('#message').value.trim()]);
    const list=$('#review');list.replaceChildren();
    for(const [label,value] of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);list.append(row);}
    $('#send-status').textContent='';$('#send-status').classList.remove('is-error');go(3);
  });
  for(const id of ['name','message'])$(`#${id}`).addEventListener('input',e=>e.target.setCustomValidity(''));
  $('#details-panel').addEventListener('input',refreshMailto);
  // Rebuilt at click time too, so the link can never carry stale details.
  document.addEventListener('click',e=>{const link=e.target.closest?.('[data-mailto-details]');if(link)link.href=mailtoHref();},true);
  $('#send-request').onclick=async()=>{
    if(sending)return;
    if(!selection||selection<=today()){resetPastDate();calendar();go(1);return;}
    if(!$('#details-panel').checkValidity()){go(2);$('#details-panel').reportValidity();return;}
    const details={
      name:$('#name').value.trim(), email:$('#email').value.trim(),
      company:$('#company').value.trim(), message:$('#message').value.trim(),
      preferred_date:selection, preferred_time:preferred, timezone:$('#timezone').value,
      meeting_status:'Requested, awaiting confirmation',
      _subject:'Website inquiry for Mert Tureli', _gotcha:$('#inquiry-website').value
    };
    sending=true;$('#send-request').disabled=true;
    $('#review-panel [data-back]').disabled=true;$('#review-panel').setAttribute('aria-busy','true');
    const status=$('#send-status');status.classList.remove('is-error');status.textContent='Sending your request...';
    try{
      await sendInquiry(INQUIRY_ENDPOINT,details);
      track('inquiry-submitted');
      $('#complete-copy').textContent=`Thank you, ${details.name}. Your request for ${shortDate.format(date(selection))} has been sent.`;
      status.textContent='';go(4,dialog.open);
    }catch(error){
      track('inquiry-error');
      status.textContent=error.message;status.classList.add('is-error');
      const fallback=document.createElement('a');fallback.className='status-fallback';fallback.dataset.mailtoDetails='';
      fallback.href=mailtoHref();fallback.textContent='Email these details instead';
      status.append(document.createElement('br'),fallback);
    }
    finally{sending=false;$('#send-request').disabled=false;$('#review-panel [data-back]').disabled=false;$('#review-panel').removeAttribute('aria-busy');}
  };
  // Small, user-triggered transitions. No animation loop or embedded prototype.
  document.querySelectorAll('[data-study]').forEach(button=>button.addEventListener('click',()=>{
    $('#design-excerpt').dataset.style=button.dataset.study;
    $('#design-excerpt').setAttribute('aria-label',`${button.textContent} design study`);
    document.querySelectorAll('[data-study]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  $('#lift-layers').onclick=()=>{
    const lifted=$('#lift-layers').getAttribute('aria-pressed')!=='true';
    $('#design-excerpt').dataset.lifted=String(lifted);$('#lift-layers').setAttribute('aria-pressed',String(lifted));
  };
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(localZone && !Array.from($('#timezone').options).some(o=>o.value===localZone)){
    const option=document.createElement('option');option.value=localZone;
    option.textContent=localZone.replaceAll('_',' ');$('#timezone').prepend(option);
  }
  if(localZone)$('#timezone').value=localZone;
  // Phone menu. A native modal dialog, so focus stays inside and Escape closes it.
  const menu=$('#site-menu'),menuButton=$('#open-menu');
  if(menu&&menuButton&&typeof menu.showModal==='function'){
    let menuOverflow='';
    menuButton.onclick=()=>{if(menu.open)return;menuOverflow=document.body.style.overflow;document.body.style.overflow='hidden';menu.showModal();menuButton.setAttribute('aria-expanded','true');};
    $('#close-menu').onclick=()=>menu.close();
    menu.addEventListener('close',()=>{document.body.style.overflow=menuOverflow;menuButton.setAttribute('aria-expanded','false');menuButton.focus({preventScroll:true});});
    menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.close()));
    matchMedia('(min-width: 861px)').addEventListener('change',e=>{if(e.matches&&menu.open)menu.close();});
  }
  resetPastDate();calendar();
  if(location.hash==='#inquiry')open(document.querySelector('[data-open-inquiry]'));
})();
