// Shared by the four design studies. Loaded in <head>, before each study's own scripts.
(function(){
  var root=document.documentElement;
  // Inside the preview frame on the websites page, hide the back pill.
  try{if(window.self!==window.top)root.setAttribute('data-study-framed','');}catch(e){root.setAttribute('data-study-framed','');}
  // Each study reads prefers-reduced-motion once at start, so re-run the page when the setting changes.
  if(window.matchMedia){
    var mq=window.matchMedia('(prefers-reduced-motion: reduce)');
    var reload=function(){location.reload();};
    if(mq.addEventListener)mq.addEventListener('change',reload);else if(mq.addListener)mq.addListener(reload);
  }
})();
