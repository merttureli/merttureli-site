// Small project sketches, animated only while a real operation is pending.
if(!customElements.get('project-loader'))customElements.define('project-loader',class extends HTMLElement{
  connectedCallback(){
    if(this.shadowRoot)return;
    const root=this.attachShadow({mode:'open'});
    this.setAttribute('role','status');this.setAttribute('aria-label',this.getAttribute('label')||'Loading');
    root.innerHTML=`<style>
      :host{display:inline-flex;color:#e8e8e8;background:#101010;border:1px solid #ffffff26;border-radius:16px;padding:12px 18px;align-items:center;gap:14px;box-shadow:0 8px 28px #0002;font:10px/1.5 ui-monospace,monospace;letter-spacing:.1em}
      .sketch{width:54px;height:54px;position:relative}svg{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;opacity:0;animation:cycle 6s infinite}svg:nth-child(2){animation-delay:-4s}svg:nth-child(3){animation-delay:-2s}path{stroke-dasharray:220;stroke-dashoffset:0}small{display:block;color:#888;font-size:9px;letter-spacing:.06em;margin-top:3px}@keyframes cycle{0%,29%{opacity:1;transform:translateY(0)}33%,96%{opacity:0;transform:translateY(3px)}100%{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){svg{animation:none;opacity:0}svg:first-child{opacity:1}}
      </style><span class="sketch" aria-hidden="true">
      <svg viewBox="0 0 64 64"><path d="M28 46V18L32 5 36 18V46M28 18H36M28 24H36M28 42L21 53 28 50H36L43 53 36 42M29 53H35M30 57H34M32 28V38"/></svg>
      <svg viewBox="0 0 64 64"><path d="M10 49H54L57 55H7ZM17 44L12 22 23 18 29 40ZM37 40L42 18 53 22 48 44ZM16 28L24 25M18 34L26 31M41 25L49 28M39 31L47 34M23 43V49M43 43V49M23 46H43M32 46V54"/></svg>
      <svg viewBox="0 0 64 64"><path d="M10 26L32 16 54 26 32 36ZM10 26V42L32 53 54 42V26M32 36V53M17 33V39M21 35V41M25 37V43M38 40L49 35V39L38 44ZM23 26L32 22 41 26 32 30Z"/></svg>
      </span><span>MERT TURELI<small>${this.getAttribute('label')==='Loading photograph'?'LOADING PHOTOGRAPH':'LOADING'}</small></span>`;
  }
});
(() => {
  let timer, indicator;
  const clear=()=>{clearTimeout(timer);indicator?.remove();indicator=null;};
  const pending=()=>{clear();timer=setTimeout(()=>{indicator=document.createElement('project-loader');indicator.className='site-loading';document.body.append(indicator);},350);};
  document.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const link=e.composedPath().find(n=>n instanceof HTMLAnchorElement);
    if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||url.pathname===location.pathname)return;
    if(!url.pathname.endsWith('.html')&&!url.pathname.endsWith('/'))return;
    pending();setTimeout(clear,8000);
  });
  window.addEventListener('pageshow',clear);
  window.addEventListener('pagehide',clear);
  // Wait for the site's component renderer, not videos or background downloads.
  pending();
  const ready=()=>{if(document.querySelector('h1,h2')){clear();observer.disconnect();}};
  const observer=new MutationObserver(ready);observer.observe(document.body,{childList:true,subtree:true});ready();setTimeout(()=>{clear();observer.disconnect();},5000);
})();
