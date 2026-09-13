const catalogURL=new URL('./project-stories.json',import.meta.url);
const rootURL=new URL('../../',import.meta.url);
const styleURL=new URL('./project-walkthrough.css',import.meta.url);
let catalogPromise;
const loadCatalog=()=>catalogPromise??=fetch(catalogURL).then(response=>{if(!response.ok)throw Error('Project stories unavailable');return response.json();});

class ProjectWalkthrough extends HTMLElement{
  async connectedCallback(){
    if(this.started)return;this.started=true;this.step=0;this.renderToken=0;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    try{
      const data=await loadCatalog();this.project=data.projects.find(project=>project.id===this.getAttribute('project'));
      if(!this.project?.chapters?.length)return;
      if(!this.isConnected){this.started=false;return;}
      const shadow=this.attachShadow({mode:'open'});
      shadow.innerHTML=`<link rel="stylesheet" href="${styleURL.href}"><div class="walkthrough"><div class="heading"><p class="eyebrow">THE MECHANISM / THREE STAGES</p><h2>Catch. Index. Return.</h2><p class="scope"></p></div><div class="steps" role="tablist" aria-label="Mechanism stages"></div><div id="chapter-panel" role="tabpanel" tabindex="0"><figure><div class="image-frame"><img alt="" decoding="async"></div><figcaption></figcaption></figure><div class="copy"><p class="step-index"></p><h3></h3><p class="summary"></p><div class="decision"><h4>The engineering decision</h4><p></p></div><p class="contribution"></p><button class="next" type="button">Next stage →</button></div></div><div class="evidence"><span class="result"></span><span class="result-label"></span><a class="source">Read the result in context ↗</a></div><p class="feedback" role="status"></p></div>`;
      this.$=selector=>shadow.querySelector(selector);
      this.$('.scope').textContent=this.project.contribution;
      this.project.chapters.forEach((chapter,index)=>{
        const button=document.createElement('button');button.type='button';button.id=`step-${chapter.id}`;
        button.setAttribute('role','tab');button.setAttribute('aria-controls','chapter-panel');
        const number=document.createElement('span'),label=document.createElement('span');
        number.textContent=String(index+1).padStart(2,'0');label.textContent=chapter.label;button.append(number,label);
        button.onclick=()=>this.select(index);button.onkeydown=event=>{
          let next=index;
          if(event.key==='ArrowRight')next=(index+1)%this.project.chapters.length;
          else if(event.key==='ArrowLeft')next=(index+this.project.chapters.length-1)%this.project.chapters.length;
          else if(event.key==='Home')next=0;else if(event.key==='End')next=this.project.chapters.length-1;else return;
          event.preventDefault();this.select(next);this.$('.steps').children[next].focus();
        };
        this.$('.steps').append(button);
      });
      this.$('.next').onclick=()=>this.select((this.step+1)%this.project.chapters.length);
      this.$('.result').textContent=this.project.outcome.value;
      this.$('.result-label').textContent=this.project.outcome.label;
      this.$('.source').href=new URL(this.project.href+'#project-result',rootURL);
      const hash=location.hash.slice(1),initial=this.project.chapters.findIndex(chapter=>hash===`mechanism-${chapter.id}`);
      this.select(initial<0?0:initial,{initial:true});
    }catch(error){console.warn('Project walkthrough could not initialize.',error);}
  }
  select(index,{initial=false}={}){
    if(!Number.isInteger(index)||index<0||index>=this.project.chapters.length)return;
    this.step=index;const token=++this.renderToken,chapter=this.project.chapters[index];
    [...this.$('.steps').children].forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
    this.$('#chapter-panel').setAttribute('aria-labelledby',`step-${chapter.id}`);
    this.$('.step-index').textContent=`${String(index+1).padStart(2,'0')} / ${String(this.project.chapters.length).padStart(2,'0')}`;
    this.$('h3').textContent=chapter.title;this.$('.summary').textContent=chapter.summary;
    this.$('.decision p').textContent=chapter.decision;this.$('.contribution').textContent=chapter.contribution;
    this.$('.next').textContent=index===this.project.chapters.length-1?'Back to capture ←':'Next stage →';
    const media=this.project.media.find(item=>item.id===chapter.media),img=this.$('img');
    const assetURL=new URL(media.src,rootURL);
    img.alt=media.alt;img.src=assetURL;img.dataset.kind=media.kind;
    img.onload=()=>{if(token===this.renderToken)this.$('.feedback').textContent='';};
    img.onerror=()=>{if(token===this.renderToken)this.$('.feedback').textContent='The image is unavailable. The explanation remains available.';};
    this.$('figcaption').textContent=media.caption;
    if(!initial&&!this.motion.matches){
      for(const node of [this.$('figure'),this.$('.copy')]){
        for(const animation of node.getAnimations())animation.cancel();
        node.animate([{opacity:.15,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
      }
    }
    if(!initial)this.$('.feedback').textContent=`${chapter.label}, stage ${index+1} of ${this.project.chapters.length}.`;
  }
}
if(!customElements.get('project-walkthrough'))customElements.define('project-walkthrough',ProjectWalkthrough);
