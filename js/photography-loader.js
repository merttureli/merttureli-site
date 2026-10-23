// Load the isolated gallery only when it approaches the viewport.
// The corridor and viewer markup (it lived in photography-gallery.html, now a redirect to the Studio Beyond page).
const GALLERY_HTML="    <section class=\"corridor\" aria-label=\"Explore photographs\">\n      <div class=\"rails\" id=\"rails\"></div>\n      <div class=\"corridor-label\"><span class=\"meta\">THROUGH THE VIEWFINDER</span><button class=\"text-button\" id=\"enter\">Enter the collection <span aria-hidden=\"true\">↗</span></button></div>\n      <div class=\"corridor-controls\"><span class=\"meta\">DRAG TO EXPLORE / CLICK A FRAME</span><button id=\"pause\" aria-pressed=\"false\">Pause motion</button></div>\n    </section>\n  <dialog id=\"viewer\" aria-labelledby=\"photo-title\">\n    <div class=\"viewer-bar\"><span class=\"meta\">MERT TURELI / PHOTOGRAPHY</span><button id=\"close\" aria-label=\"Close photograph\">Close <span aria-hidden=\"true\">×</span></button></div>\n    <div class=\"image-stage\" id=\"image-stage\"><img id=\"still\" alt=\"\"><canvas id=\"morph\" aria-hidden=\"true\"></canvas><p id=\"load-error\" hidden>Could not load this photograph. Try another frame.</p></div>\n    <div class=\"viewer-bottom\"><div class=\"caption\" aria-live=\"polite\"><span id=\"count\" class=\"meta\"></span><h2 id=\"photo-title\"></h2></div><div class=\"viewer-actions\"><label class=\"effect-toggle\"><input type=\"checkbox\" id=\"dissolve\" checked> Soft dissolve</label><button id=\"previous\" aria-label=\"Previous photograph\">←</button><button id=\"next\" aria-label=\"Next photograph\">→</button></div></div>\n    <div id=\"thumbs\" class=\"thumbs\" aria-label=\"Choose a photograph\"></div>\n  </dialog>";
customElements.define('photo-corridor',class extends HTMLElement {
  connectedCallback(){
    if(this.started)return;
    this.started=true;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.isIntersecting))return;
      observer.disconnect();this.mount();
    },{rootMargin:'350px'});
    observer.observe(this);
  }
  async mount(){
    const loading=setTimeout(()=>{this.innerHTML='<div style="display:grid;place-items:center;height:100%"><project-loader></project-loader></div>';},250);
    try {
      const [html,css,module]=await Promise.all([
        Promise.resolve(GALLERY_HTML),
        fetch('css/photography-lab.css').then(r=>{if(!r.ok)throw Error('Styles unavailable');return r.text();}),
        import('./photography-gallery.js')
      ]);
      const root=this.attachShadow({mode:'open'});
      root.innerHTML=`<style>${css}
        :host{display:block;--bg:var(--corridor-bg,#0a0a0a);--paper:var(--corridor-paper,#eeeae4);--muted:var(--corridor-muted,#a39f99);--line:#ffffff26;--accent:#c67650;color:var(--paper);font-family:var(--font-body,Arial,sans-serif)}
        .corridor{margin-top:0;height:clamp(430px,48vw,740px)}
        @media(max-width:650px){.corridor{height:430px}}
      </style>${html}`;
      module.mountGallery(root);
    } catch {
      this.innerHTML='<p style="text-align:center;padding:60px"><a href="photography-lab.html">Explore photography</a></p>';
    } finally {
      clearTimeout(loading);
    }
  }
});
