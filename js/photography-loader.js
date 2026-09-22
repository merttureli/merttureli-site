// Load the isolated gallery only when it approaches the viewport.
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
        fetch('photography-gallery.html').then(r=>{if(!r.ok)throw Error('Gallery unavailable');return r.text();}),
        fetch('css/photography-lab.css').then(r=>{if(!r.ok)throw Error('Styles unavailable');return r.text();}),
        import('./photography-gallery.js')
      ]);
      const root=this.attachShadow({mode:'open'});
      root.innerHTML=`<style>${css}
        :host{display:block;--bg:#0a0a0a;--paper:#eeeae4;--muted:#a39f99;--line:#ffffff26;--accent:#c67650;color:var(--paper);font-family:var(--font-body,Arial,sans-serif)}
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
