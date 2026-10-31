export const FONTS = {
  book: { label: 'Книжный', family: 'Georgia, "Times New Roman", serif' },
  modern: { label: 'Современный', family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  mono: { label: 'Моноширинный', family: 'ui-monospace, "Courier New", monospace' }
};
export const DEFAULT_READING = { font: 'book', size: 18, line: 1.8, margin: 24, weight: '400', style: 'normal', align: 'left', paper: 'system', mode: 'pages', animation: 'curl' };
export function normalizeReading(value = {}) {
  const number = (key,min,max) => Number.isFinite(Number(value[key])) ? Math.min(max,Math.max(min,Number(value[key]))) : DEFAULT_READING[key];
  const choice = (key,list) => list.includes(value[key]) ? value[key] : DEFAULT_READING[key];
  return {
    font: choice('font',Object.keys(FONTS)), size: number('size',16,42), line: number('line',1.35,2.2), margin: number('margin',12,40),
    weight: choice('weight',['400','500','600']), style: choice('style',['normal','italic']), align: choice('align',['left','justify']),
    paper: choice('paper',['system','cream','sepia','night']), mode: choice('mode',['pages','scroll']), animation: choice('animation',['curl','slide','none'])
  };
}
export function loadReading() {
  try { return normalizeReading(JSON.parse(localStorage.getItem('lumi-reading') || '{}')); }
  catch { return {...DEFAULT_READING}; }
}
export function saveReading(value) { localStorage.setItem('lumi-reading',JSON.stringify(normalizeReading(value))); }
export function applyReading(reader,article,prefs) {
  reader.dataset.paper=prefs.paper;
  article.style.fontFamily=FONTS[prefs.font].family;
  article.style.fontSize=`${prefs.size}px`;
  article.style.lineHeight=prefs.line;
  article.style.fontWeight=prefs.weight;
  article.style.fontStyle=prefs.style;
  article.style.textAlign=prefs.align;
  article.style.setProperty('--reading-margin',`${prefs.margin}px`);
}

/** Columns are screen-sized leaves; source chapter/fragment numbers remain stable for bookmarks. */
export class BookPages {
  constructor(viewport,article) { this.viewport=viewport;this.article=article;this.index=0;this.count=1;this.enabled=false; }
  layout(prefs,enabled,position=0) {
    const v=this.viewport,a=this.article;
    this.enabled=enabled&&prefs.mode==='pages';
    v.classList.toggle('book-pages',this.enabled);
    a.classList.toggle('book-layout',this.enabled);
    v.scrollLeft=0;
    if(!this.enabled) {
      a.style.removeProperty('--column-width');a.style.removeProperty('--page-height');a.style.removeProperty('--page-width');
      this.index=0;this.count=1;
      v.scrollTop=Math.max(0,Math.min(1,position))*Math.max(0,v.scrollHeight-v.clientHeight);
      return;
    }
    a.style.setProperty('--column-width',`${Math.max(80,v.clientWidth-2*prefs.margin)}px`);
    a.style.setProperty('--page-width',`${v.clientWidth}px`);
    a.style.setProperty('--page-height',`${v.clientHeight}px`);
    v.scrollTop=0;
    this.count=Math.max(1,Math.ceil((a.scrollWidth-1)/v.clientWidth));
    this.go(Math.round(Math.min(1,Math.max(0,position))*(this.count-1)));
  }
  go(index) {
    this.index=Math.max(0,Math.min(this.count-1,index));
    this.viewport.scrollLeft=this.index*this.viewport.clientWidth;
  }
  position() { return this.enabled ? this.count>1?this.index/(this.count-1):0 : this.viewport.scrollTop/Math.max(1,this.viewport.scrollHeight-this.viewport.clientHeight); }
  toAnchor(element) {
    if(!element)return;
    if(this.enabled) {
      const relative=element.getBoundingClientRect().left-this.viewport.getBoundingClientRect().left+this.viewport.scrollLeft;
      this.go(Math.floor(Math.max(0,relative)/this.viewport.clientWidth));
    } else element.scrollIntoView({block:'start'});
  }
}

export async function animateLeaf(viewport,direction,stage,style) {
  if(style==='none'||matchMedia('(prefers-reduced-motion: reduce)').matches||!viewport.animate)return;
  const sign=direction>0?-1:1;
  const curl=style==='curl';
  const edge=curl?`perspective(1400px) translateX(${sign*3}%) rotateY(${sign*12}deg)`:`translateX(${sign*12}%)`;
  const other=curl?`perspective(1400px) translateX(${-sign*3}%) rotateY(${-sign*9}deg)`:`translateX(${-sign*12}%)`;
  const frames=stage==='out' ? [{transform:'none',opacity:1},{transform:edge,opacity:.55}] : [{transform:other,opacity:.55},{transform:'none',opacity:1}];
  viewport.style.transformOrigin=direction>0?'left center':'right center';
  const animation=viewport.animate(frames,{duration:stage==='out'?110:180,easing:'cubic-bezier(.2,.65,.3,1)'});
  try {await animation.finished;}catch {/* Closing the reader cancels a turn safely. */}
  finally {animation.cancel();viewport.style.transformOrigin='';}
}
