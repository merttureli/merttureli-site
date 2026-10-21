// Delegate the launcher because the portfolio hydrates its own markup.
(() => {
  const dialog=document.getElementById('charger-explorer');
  const frame=document.getElementById('charger-frame');
  if(!dialog||!frame)return;
  const closeButton=document.getElementById('charger-close');
  const status=document.getElementById('charger-launch-status');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let returnFocus=null,scrollPosition=0,savedStyle=null,closing=false,closeTimer=0,pendingBack=false,reopenAfterBack=null,cleaned=true;
  let resumeVideo=false,heroVideo=null;
  const sendActive=active=>frame.contentWindow?.postMessage({type:'charger:active',active},location.origin);
  function open(trigger){
    if(typeof dialog.showModal!=='function'){location.href=frame.dataset.src;return;}
    if(closing){clearTimeout(closeTimer);closing=false;dialog.classList.remove('is-closing');}
    if(dialog.open)return;
    // A close is still waiting for its history.back(). Reopen once it lands, or its popstate would close this open.
    if(pendingBack){reopenAfterBack=trigger||true;return;}
    returnFocus=trigger||document.getElementById('charger-launch');
    const rect=returnFocus?.getBoundingClientRect();
    if(rect)dialog.style.setProperty('--charger-origin',`${Math.max(0,Math.min(100,(rect.x+rect.width/2)/innerWidth*100))}% ${Math.max(0,Math.min(100,(rect.y+rect.height/2)/innerHeight*100))}%`);
    // Push the history entry before the body is pinned, so the entry under it keeps the real scroll position.
    // A deep link (#charger-explorer already in the URL) and Forward onto the entry reuse the current one.
    if(location.hash!=='#charger-explorer')history.pushState({chargerExplorer:true},'','#charger-explorer');
    cleaned=false;
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
  }
  function finishClose(){
    dialog.close();dialog.classList.remove('is-closing');closing=false;
    afterClose();// not left to the async close event, so a quick reopen cannot slip in before the cleanup
  }
  function close(){
    if(!dialog.open||closing)return;
    closing=true;sendActive(false);dialog.classList.add('is-closing');
    if(reduced.matches)finishClose();else closeTimer=setTimeout(finishClose,220);
  }
  function afterClose(){
    if(cleaned)return;cleaned=true;
    clearTimeout(closeTimer);sendActive(false);
    if(savedStyle)Object.assign(document.body.style,savedStyle);
    savedStyle=null;
    scrollTo({top:scrollPosition,behavior:'instant'});
    document.getElementById('charger-launch')?.setAttribute('aria-expanded','false');
    // Back and Forward already moved the URL. Otherwise drop the entry open() pushed, so Back never
    // lands on the open dialog. A deep-link entry has nothing to go back to, so only strip the hash.
    if(location.hash==='#charger-explorer'){
      if(history.state?.chargerExplorer){pendingBack=true;history.back();setTimeout(settleBack,1500);}
      else history.replaceState(history.state,'',location.pathname+location.search);
    }
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    else document.getElementById('charger-launch')?.focus({preventScroll:true});
    if(resumeVideo&&heroVideo?.isConnected)heroVideo.play().catch(()=>{});
    heroVideo=null;resumeVideo=false;
  }
  // The close event is async and can arrive after a quick reopen; only clean up if the dialog is still closed.
  dialog.addEventListener('close',()=>{if(!dialog.open)afterClose();});
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
  // popstate covers Back and Forward, hashchange covers a hand-edited URL. Both are idempotent, so
  // browsers that fire both for one navigation open or close the dialog once.
  const syncWithURL=()=>{if(location.hash==='#charger-explorer')open();else if(dialog.open)close();};
  function settleBack(){
    if(!pendingBack)return;
    pendingBack=false;
    // The traversal never happened (no earlier entry to go back to): fall back to stripping the hash.
    if(location.hash==='#charger-explorer')history.replaceState(history.state,'',location.pathname+location.search);
    const again=reopenAfterBack;reopenAfterBack=null;
    if(again)open(again===true?undefined:again);
  }
  window.addEventListener('popstate',()=>{if(pendingBack)settleBack();else syncWithURL();});
  window.addEventListener('hashchange',syncWithURL);
  if(location.hash==='#charger-explorer')open();
})();
