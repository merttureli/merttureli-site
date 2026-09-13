// Delegate the launcher because the portfolio hydrates its own markup.
(() => {
  const dialog=document.getElementById('charger-explorer');
  const frame=document.getElementById('charger-frame');
  if(!dialog||!frame)return;
  const closeButton=document.getElementById('charger-close');
  const status=document.getElementById('charger-launch-status');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let returnFocus=null,scrollPosition=0,savedStyle=null,closing=false,closeTimer=0,previousURL=null;
  let resumeVideo=false,heroVideo=null;
  const sendActive=active=>frame.contentWindow?.postMessage({type:'charger:active',active},location.origin);
  function open(trigger){
    if(typeof dialog.showModal!=='function'){location.href=frame.dataset.src;return;}
    if(closing){clearTimeout(closeTimer);closing=false;dialog.classList.remove('is-closing');}
    if(dialog.open)return;
    returnFocus=trigger||document.getElementById('charger-launch');
    const rect=returnFocus?.getBoundingClientRect();
    if(rect)dialog.style.setProperty('--charger-origin',`${Math.max(0,Math.min(100,(rect.x+rect.width/2)/innerWidth*100))}% ${Math.max(0,Math.min(100,(rect.y+rect.height/2)/innerHeight*100))}%`);
    scrollPosition=scrollY;
    savedStyle={};
    for(const key of ['position','top','width','overflow','paddingRight'])savedStyle[key]=document.body.style[key];
    const gutter=innerWidth-document.documentElement.clientWidth;
    document.body.style.paddingRight=(parseFloat(getComputedStyle(document.body).paddingRight)+gutter)+'px';
    Object.assign(document.body.style,{position:'fixed',top:`-${scrollPosition}px`,width:'100%',overflow:'hidden'});
    heroVideo=document.querySelector('[data-hero-clip="charger"]');
    resumeVideo=heroVideo&&!heroVideo.paused;
    heroVideo?.pause();
    dialog.showModal();
    document.getElementById('charger-launch')?.setAttribute('aria-expanded','true');
    if(!frame.hasAttribute('src'))frame.src=frame.dataset.src;
    else sendActive(true);
    closeButton.focus({preventScroll:true});
    if(location.hash!=='#charger-explorer'){
      previousURL=location.href;
      history.replaceState(history.state,'','#charger-explorer');
    }
  }
  function finishClose(){
    dialog.close();dialog.classList.remove('is-closing');closing=false;
  }
  function close(){
    if(!dialog.open||closing)return;
    closing=true;sendActive(false);dialog.classList.add('is-closing');
    if(reduced.matches)finishClose();else closeTimer=setTimeout(finishClose,220);
  }
  dialog.addEventListener('close',()=>{
    clearTimeout(closeTimer);sendActive(false);
    if(savedStyle)Object.assign(document.body.style,savedStyle);
    savedStyle=null;
    scrollTo({top:scrollPosition,behavior:'instant'});
    document.getElementById('charger-launch')?.setAttribute('aria-expanded','false');
    if(location.hash==='#charger-explorer')history.replaceState(history.state,'',previousURL||location.pathname+location.search);
    previousURL=null;
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    else document.getElementById('charger-launch')?.focus({preventScroll:true});
    if(resumeVideo&&heroVideo?.isConnected)heroVideo.play().catch(()=>{});
    heroVideo=null;resumeVideo=false;
  });
  closeButton.addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  let backdropDown=false;
  const outside=event=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(backdropDown&&event.target===dialog&&outside(event))close();backdropDown=false;});
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('#charger-launch,a[href="#charger-explorer"]');
    if(!trigger||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();open(trigger);
  });
  frame.addEventListener('load',()=>{status.hidden=true;sendActive(dialog.open&&!closing);});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='charger:close')close();
  });
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#charger-explorer')open();else if(dialog.open)close();
  });
  if(location.hash==='#charger-explorer')open();
})();
