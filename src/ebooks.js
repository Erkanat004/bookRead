import { FileReader, ZipArchive, resolvePath } from './archive.js';
import { cleanTitle } from './model.js';

const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const all = (node,name) => [...node.getElementsByTagNameNS('*',name)];
const first = (node,name) => all(node,name)[0];
const text = (node,name) => first(node,name)?.textContent.trim() || '';
const attribute = (node,name) => [...(node?.attributes||[])].find(a=>a.localName===name)?.value || '';
const imageType = name => ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml'}[name.split('.').pop().toLowerCase()]);
const blockTags = new Set(['p','h1','h2','h3','h4','h5','h6','div','section','article','blockquote','pre','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','figure','figcaption','hr','dl','dt','dd']);
const inlineTags = new Set(['span','strong','em','b','i','u','s','sup','sub','br','code','small','ruby','rt','rp','mark','abbr']);
const svgTags = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','use','symbol','title','desc']);
const svgAttributes = new Set(['viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','fill','stroke','stroke-width','fill-rule','opacity','fill-opacity','stroke-opacity','transform','offset','stop-color','stop-opacity','id','clip-path','font-size','text-anchor']);
const mathTags = new Set(['math','mrow','mi','mn','mo','ms','mtext','mfrac','msqrt','mroot','msup','msub','msubsup','munder','mover','munderover','mtable','mtr','mtd','mfenced','mspace','semantics']);

export function decodeText(bytes) {
  if(bytes[0]===255 && bytes[1]===254) return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===254 && bytes[1]===255) return new TextDecoder('utf-16be').decode(bytes);
  const header=new TextDecoder('ascii').decode(bytes.subarray(0,256));
  if(/encoding\s*=\s*["'](?:windows-1251|cp1251)/i.test(header)) return new TextDecoder('windows-1251').decode(bytes);
  try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { return new TextDecoder('windows-1251').decode(bytes); }
}
function xml(string) {
  if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(string)) throw new Error('XML с пользовательскими сущностями не поддерживается.');
  string=string.replace(/<!DOCTYPE(?:[^>"']|"[^"]*"|'[^']*')*>/gi,'');
  const doc=new DOMParser().parseFromString(string,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('Повреждена XML-структура книги.');
  return doc;
}
function splitBlocks(blocks, target=6000) {
  const pages=[];let page=[],size=0;
  for(const block of blocks) {
    if(size>=target && page.length) {pages.push(page);page=[];size=0;}
    page.push(block);size+=block.textContent?.length || 500;
  }
  if(page.length) pages.push(page);
  return pages.length ? pages : [[]];
}
function blocksFrom(node) {
  const result=[];
  for(const child of node.childNodes) {
    if(child.nodeType===3) {if(child.textContent.trim()) result.push(child);continue;}
    if(child.nodeType!==1) continue;
    const tag=child.localName.toLowerCase();
    if(['script','style','head','metadata','binary','iframe','object','embed','form','annotation-xml'].includes(tag)) continue;
    if(['section','body','div','article','main','text'].includes(tag)) result.push(...blocksFrom(child));
    else result.push(child);
  }
  return result;
}
async function safeHtml(node, image, links) {
  if(node.nodeType===3) return escape(node.textContent);
  if(node.nodeType!==1 && node.nodeType!==11) return '';
  if(node.nodeType===11) return (await Promise.all([...node.childNodes].map(n=>safeHtml(n,image,links)))).join('');
  const original=node.localName, tag=original.toLowerCase();
  if(['script','style','head','metadata','binary','iframe','object','embed','form','input','button','link','annotation-xml'].includes(tag)) return '';
  if(tag==='img' || tag==='image' && node.namespaceURI!=='http://www.w3.org/2000/svg') {
    const href=attribute(node,'src') || attribute(node,'href');
    const src=await image(href);
    return src ? `<figure><img src="${escape(src)}" alt="${escape(attribute(node,'alt') || 'Иллюстрация')}"></figure>` : `<span class="image-unavailable">${escape(attribute(node,'alt') || 'Иллюстрация недоступна в этом файле')}</span>`;
  }
  if(svgTags.has(original) && node.namespaceURI==='http://www.w3.org/2000/svg') {
    let attrs='';
    for(const a of [...node.attributes]) if(svgAttributes.has(a.name) && !/javascript:|https?:|data:|\/\//i.test(a.value)) attrs+=` ${a.name}="${escape(a.value)}"`;
    if(original==='svg') attrs+=' xmlns="http://www.w3.org/2000/svg"';
    if(original==='use') {const href=attribute(node,'href');if(href.startsWith('#'))attrs+=` href="${escape(href)}"`;}
    return `<${original}${attrs}>${(await Promise.all([...node.childNodes].map(n=>safeHtml(n,image,links)))).join('')}</${original}>`;
  }
  if(mathTags.has(tag)) return `<${tag}${tag==='math'?' xmlns="http://www.w3.org/1998/Math/MathML"':''}>${(await Promise.all([...node.childNodes].map(n=>safeHtml(n,image,links)))).join('')}</${tag}>`;
  let mapped=({title:'h2',subtitle:'h3',emphasis:'em',strikethrough:'s',emptyline:'br','empty-line':'br',cite:'blockquote',poem:'blockquote',stanza:'p',v:'div','text-author':'p',annotation:'aside',epigraph:'blockquote'})[tag] || tag;
  const children=(await Promise.all([...node.childNodes].map(n=>safeHtml(n,image,links)))).join('');
  if(tag==='a') {
    const target=links?.(attribute(node,'href'));
    return target ? `<a href="#" data-book-page="${target.page}" data-book-anchor="${escape(target.anchor||'')}">${children}</a>` : children;
  }
  if(!blockTags.has(mapped) && !inlineTags.has(mapped) && mapped!=='aside') return children;
  let attrs='';
  const id=attribute(node,'id');if(id)attrs+=` data-anchor="${escape(id)}"`;
  for(const key of ['colspan','rowspan']) if(/^\d{1,3}$/.test(attribute(node,key)))attrs+=` ${key}="${attribute(node,key)}"`;
  if(mapped==='br'||mapped==='hr')return `<${mapped}>`;
  return `<${mapped}${attrs}>${children}</${mapped}>`;
}
async function thumbnail(blob) {
  const url=URL.createObjectURL(blob);
  try {
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(300/img.naturalWidth,450/img.naturalHeight,1);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.8);
  } finally {URL.revokeObjectURL(url);}
}
export async function openEbook(source, info) {
  const reader=new FileReader(source,info.size);let format=info.format;
  let pageUrls=[], zip, coverBlob=null;
  const result={numPages:1,title:cleanTitle(info.name||info.title),author:'',toc:[],unit:'Фрагмент',imageOnly:false,cover:'',async dispose(){pageUrls.forEach(URL.revokeObjectURL);pageUrls=[];}};
  const blobUrl=blob=>{const url=URL.createObjectURL(blob);pageUrls.push(url);return url;};
  const beginPage=()=>{pageUrls.forEach(URL.revokeObjectURL);pageUrls=[];};
  const inlineImage=async href=>/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(href) ? href : null;
  const archiveImage=async (base,href)=>{
    if(!href)return null;
    const path=resolvePath(base,href);if(!path || !zip.entries.has(path))return null;
    const type=imageType(path);if(!type)return null;
    let blob=await zip.read(path);
    if(type==='image/svg+xml') {
      const doc=xml(await blob.text());const safe=await safeHtml(doc.documentElement,async()=>null);
      blob=new Blob([safe],{type});
    } else blob=new Blob([blob],{type});
    return blobUrl(blob);
  };
  if(['epub','docx','odt','cbz','fb2zip','zip'].includes(format)) zip=await new ZipArchive(reader).open();
  if(format==='zip')format=zip.entries.has('META-INF/container.xml')?'epub':zip.entries.has('word/document.xml')?'docx':zip.entries.has('content.xml')?'odt':[...zip.entries.keys()].some(n=>/\.fb2$/i.test(n))?'fb2zip':'cbz';
  if(format==='epub') {
    const container=xml(await (await zip.read('META-INF/container.xml')).text());
    const packagePath=attribute(first(container,'rootfile'),'full-path');
    const packageDoc=xml(await (await zip.read(packagePath)).text());
    const manifest=new Map(all(packageDoc,'item').map(item=>[attribute(item,'id'),{path:resolvePath(packagePath,attribute(item,'href')),type:attribute(item,'media-type'),properties:attribute(item,'properties')}]));
    const spine=all(packageDoc,'itemref').map(item=>manifest.get(attribute(item,'idref'))).filter(item=>item?.path);
    if(!spine.length)throw new Error('В EPUB отсутствуют разделы для чтения.');
    if(zip.entries.has('META-INF/encryption.xml')){const encrypted=xml(await (await zip.read('META-INF/encryption.xml')).text());if(all(encrypted,'CipherReference').some(n=>spine.some(s=>s.path===attribute(n,'URI'))))throw new Error('EPUB защищён DRM. Нужна незашифрованная копия книги.');}
    result.title=text(packageDoc,'title')||result.title;result.author=text(packageDoc,'creator');result.numPages=spine.length;result.unit='Раздел';
    const links=(base,href)=>{const path=resolvePath(base,href);const index=spine.findIndex(item=>item.path===path);return index>=0?{page:index+1,anchor:decodeURIComponent(href.split('#')[1]||'')}:null;};
    const coverId=all(packageDoc,'meta').find(n=>attribute(n,'name')==='cover')?.getAttribute('content');
    const cover=[...manifest.values()].find(i=>i.properties.split(/\s+/).includes('cover-image'))||manifest.get(coverId);
    if(cover?.path && imageType(cover.path) && !cover.path.endsWith('.svg'))coverBlob=new Blob([await zip.read(cover.path)],{type:imageType(cover.path)});
    const nav=[...manifest.values()].find(i=>i.properties.split(/\s+/).includes('nav'));
    if(nav) {
      const navDoc=xml(await (await zip.read(nav.path)).text());
      const toc=all(navDoc,'nav').find(n=>attribute(n,'type').split(/\s+/).includes('toc'))||first(navDoc,'nav');
      if(toc)result.toc=all(toc,'a').map(a=>({title:a.textContent.trim(),...links(nav.path,attribute(a,'href'))})).filter(t=>t.page);
    }
    if(!result.toc.length) {
      const ncx=[...manifest.values()].find(i=>i.type==='application/x-dtbncx+xml');
      if(ncx){const navDoc=xml(await (await zip.read(ncx.path)).text());result.toc=all(navDoc,'navPoint').map(n=>({title:text(n,'navLabel'),...links(ncx.path,attribute(first(n,'content'),'src'))})).filter(t=>t.page);}
    }
    if(!result.toc.length)result.toc=spine.map((_,i)=>({page:i+1,title:`Раздел ${i+1}`}));
    result.getPage=async n=>{
      beginPage();const entry=spine[n-1];const doc=xml(await (await zip.read(entry.path)).text());
      return safeHtml(first(doc,'body')||doc.documentElement,href=>archiveImage(entry.path,href),href=>links(entry.path,href));
    };
  } else if(format==='cbz' || format==='image') {
    const images=format==='cbz'?[...zip.entries.keys()].filter(n=>imageType(n)).sort((a,b)=>a.localeCompare(b,'ru',{numeric:true})):['image'];
    if(!images.length)throw new Error('В CBZ не найдены изображения.');
    result.numPages=images.length;result.unit='Страница';result.imageOnly=true;
    const imageBlob=async n=>format==='image'?new Blob([await reader.read(0,info.size)],{type:info.mime||imageType(info.name)||'image/jpeg'}):new Blob([await zip.read(images[n-1])],{type:imageType(images[n-1])});
    coverBlob=await imageBlob(1);
    result.getPage=async n=>{beginPage();return `<img class="comic-page" src="${blobUrl(await imageBlob(n))}" alt="Страница ${n}">`;};
  } else if(format==='txt' || format==='md') {
    const sample=await reader.read(0,Math.min(info.size,4096));
    const utf16=sample[0]===255&&sample[1]===254?'utf-16le':sample[0]===254&&sample[1]===255?'utf-16be':null;
    let encoding=utf16||'utf-8';if(!utf16){try{new TextDecoder('utf-8',{fatal:true}).decode(sample,{stream:true});}catch{encoding='windows-1251';}}
    const chunk=32768;result.numPages=Math.max(1,Math.ceil(info.size/chunk));
    result.getPage=async n=>{
      beginPage();let start=(n-1)*chunk,end=Math.min(info.size,n*chunk);const extra=encoding==='utf-8'?4:0;
      const bytes=await reader.read(start,Math.min(info.size,end+extra));let from=0,to=end-start;
      if(encoding==='utf-8') {if(start)while(from<bytes.length&&(bytes[from]&192)===128)from++;if(end<info.size)while(to<bytes.length&&(bytes[to]&192)===128)to++;}
      const value=new TextDecoder(encoding).decode(bytes.subarray(from,to)).replace(/^\uFEFF/,'');
      if(value.includes('\0'))throw new Error('Файл не похож на текстовую книгу.');
      return value.split(/\r?\n\s*\r?\n/).map(p=>format==='md'&&/^#{1,6}\s/.test(p)?`<h2>${escape(p.replace(/^#+\s/,''))}</h2>`:`<p>${escape(p).replace(/\r?\n/g,'<br>')}</p>`).join('');
    };
  } else {
    let doc, blocks, image=inlineImage;
    if(format==='fb2'||format==='fb2zip') {
      const file=format==='fb2zip'?[...zip.entries.keys()].find(n=>/\.fb2$/i.test(n)):null;
      if(format==='fb2zip'&&!file)throw new Error('В архиве не найден FB2-файл.');
      const bytes=new Uint8Array(format==='fb2zip'?await (await zip.read(file)).arrayBuffer():await reader.read(0,info.size));
      doc=xml(decodeText(bytes));
      if(doc.documentElement.localName!=='FictionBook')throw new Error('Файл не является книгой FB2.');
      result.title=text(doc,'book-title')||result.title;
      const author=first(doc,'author');if(author)result.author=[text(author,'first-name'),text(author,'middle-name'),text(author,'last-name')].filter(Boolean).join(' ');
      const binaries=new Map(all(doc,'binary').map(b=>[attribute(b,'id'),b]));
      const fbImage=href=>{const binary=binaries.get(href.replace(/^#/,''));const type=binary&&attribute(binary,'content-type');return /^image\/(png|jpeg|gif|webp|bmp)$/.test(type||'')?`data:${type};base64,${binary.textContent.replace(/\s/g,'')}`:null;};
      image=async href=>fbImage(href);
      const cover=first(doc,'coverpage');const coverSrc=cover&&fbImage(attribute(first(cover,'image'),'href'));
      if(coverSrc){const binary=atob(coverSrc.split(',')[1]);coverBlob=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:coverSrc.slice(5,coverSrc.indexOf(';'))});}
      blocks=[];const annotation=first(doc,'annotation');if(annotation)blocks.push(annotation);
      for(const body of all(doc,'body'))blocks.push(...blocksFrom(body));
    } else if(format==='docx') {
      const word=xml(await (await zip.read('word/document.xml')).text());
      const relationships=new Map();
      if(zip.entries.has('word/_rels/document.xml.rels')){const rel=xml(await (await zip.read('word/_rels/document.xml.rels')).text());for(const r of all(rel,'Relationship'))if(attribute(r,'TargetMode')!=='External')relationships.set(attribute(r,'Id'),resolvePath('word/document.xml',attribute(r,'Target')));}
      doc=document.implementation.createHTMLDocument('');const body=doc.body;
      const convert=async node=>{
        if(node.nodeType!==1)return null;
        const name=node.localName;
        if(['pPr','rPr','sectPr','tblPr','trPr','tcPr','instrText','del','bookmarkEnd'].includes(name))return null;
        if(name==='t'){return doc.createTextNode(node.textContent);}
        if(name==='tab')return doc.createTextNode('    ');
        if(name==='br'||name==='cr')return doc.createElement('br');
        if(name==='blip') {const path=relationships.get(attribute(node,'embed'));if(!path)return null;const img=doc.createElement('img');img.setAttribute('src',path);return img;}
        const map={p:'p',tbl:'table',tr:'tr',tc:'td',r:'span'};
        let tag=map[name]||'span';
        if(name==='p'){const style=first(node,'pStyle');const level=style&&attribute(style,'val').match(/(?:heading|заголовок)\s*([1-6])/i);if(level)tag=`h${level[1]}`;}
        const el=doc.createElement(tag);
        for(const child of node.childNodes){const converted=await convert(child);if(converted)el.append(converted);}
        if(name==='r'){const prop=first(node,'rPr');if(prop){for(const [style,html] of [['b','strong'],['i','em'],['u','u'],['strike','s']])if(first(prop,style)&&attribute(first(prop,style),'val')!=='0'){const wrapper=doc.createElement(html);wrapper.append(...el.childNodes);el.append(wrapper);}}}
        if(name==='tc'){const span=first(node,'gridSpan');if(span)el.setAttribute('colspan',attribute(span,'val'));}
        return el;
      };
      for(const n of first(word,'body').children){const el=await convert(n);if(el)body.append(el);}
      // Notes are part of the document, too.
      for(const notePath of ['word/footnotes.xml','word/endnotes.xml'])if(zip.entries.has(notePath)){const notes=xml(await (await zip.read(notePath)).text());const heading=doc.createElement('h2');heading.textContent='Примечания';body.append(heading);for(const p of all(notes,'p')){const el=await convert(p);if(el)body.append(el);}}
      blocks=blocksFrom(body);image=href=>archiveImage('',href);
      if(zip.entries.has('docProps/core.xml')){const core=xml(await (await zip.read('docProps/core.xml')).text());result.title=text(core,'title')||result.title;result.author=text(core,'creator');}
      const picture=body.querySelector('img');if(picture){const path=picture.getAttribute('src');if(imageType(path))coverBlob=new Blob([await zip.read(path)],{type:imageType(path)});}
    } else if(format==='odt') {
      const odt=xml(await (await zip.read('content.xml')).text());
      const rename=node=>{
        if(node.nodeType===3)return document.createTextNode(node.textContent);
        if(node.nodeType!==1)return document.createTextNode('');
        const name=node.localName,map={h:'h2',p:'p',list:'ul','list-item':'li',table:'table','table-row':'tr','table-cell':'td',span:'span',image:'img','line-break':'br'};
        const out=document.createElement(map[name]||'div');
        if(name==='image')out.setAttribute('src',attribute(node,'href'));
        for(const child of node.childNodes)out.append(rename(child));
        return out;
      };
      doc=rename(first(odt,'text'));blocks=blocksFrom(doc);image=href=>archiveImage('',href);
      if(zip.entries.has('meta.xml')){const meta=xml(await (await zip.read('meta.xml')).text());result.title=text(meta,'title')||result.title;result.author=text(meta,'creator');}
    } else if(format==='html') {
      const template=document.createElement('template');template.innerHTML=decodeText(await reader.read(0,info.size));
      result.title=template.content.querySelector('title')?.textContent.trim()||result.title;
      blocks=blocksFrom(template.content);
    } else if(format==='rtf') {
      const value=new TextDecoder('windows-1251').decode(await reader.read(0,info.size));
      const template=document.createElement('template');template.innerHTML=rtfHtml(value);blocks=blocksFrom(template.content);
    } else throw new Error('Неизвестный формат книги.');
    const pages=splitBlocks(blocks);result.numPages=pages.length;
    result.toc=pages.flatMap((nodes,index)=>nodes.filter(n=>/^h[1-6]$|^title$/.test(n.localName||'')).map(n=>({page:index+1,title:n.textContent.trim().slice(0,160)})));
    const anchors=new Map();pages.forEach((nodes,index)=>nodes.forEach(n=>{if(n.nodeType===1){if(attribute(n,'id'))anchors.set(attribute(n,'id'),index+1);for(const el of n.querySelectorAll('[id]'))anchors.set(el.id,index+1);}}));
    result.getPage=async n=>{beginPage();return (await Promise.all(pages[n-1].map(node=>safeHtml(node,image,href=>href.startsWith('#')&&anchors.has(href.slice(1))?{page:anchors.get(href.slice(1)),anchor:href.slice(1)}:null)))).join('');};
  }
  if(coverBlob)try{result.cover=await thumbnail(coverBlob);}catch(e){if(result.imageOnly)throw new Error('Не удалось декодировать изображение. Проверьте, что файл не повреждён.');}
  return result;
}

export function rtfHtml(input) {
  if(!/^\s*{\\rtf/.test(input))throw new Error('Файл не является документом RTF.');
  const pictures=[];
  input=input.replace(/\{\\pict\b[\s\S]*?\}/g,group=>{
    const type=/\\pngblip/.test(group)?'png':/\\jpegblip/.test(group)?'jpeg':null;
    if(!type)return '';
    const hex=group.replace(/\\[a-z]+-?\d* ?/gi,'').replace(/[^a-f\d]/gi,'');
    if(hex.length%2)return '';
    let binary='';for(let i=0;i<hex.length;i+=2)binary+=String.fromCharCode(parseInt(hex.slice(i,i+2),16));
    const token=`LUMIPICTURE${pictures.length}END`;
    pictures.push(`<img src="data:image/${type};base64,${btoa(binary)}" alt="Иллюстрация">`);return token;
  });
  const paragraphs=[];let paragraph='',stack=[],skip=false,uc=1,skipChars=0;
  const push=()=>{if(paragraph.trim())paragraphs.push(`<p>${paragraph}</p>`);paragraph='';};
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(c==='{'){stack.push({skip,uc});continue;}
    if(c==='}'){const state=stack.pop();if(state){skip=state.skip;uc=state.uc;}continue;}
    if(c==='\\') {
      const rest=input.slice(i+1);
      if(rest[0]==="'") {const n=parseInt(rest.slice(1,3),16);if(!skip && !skipChars)paragraph+=escape(new TextDecoder('windows-1251').decode(Uint8Array.of(n)));if(skipChars)skipChars--;i+=3;continue;}
      if(/[\\{}]/.test(rest[0])){if(!skip && !skipChars)paragraph+=escape(rest[0]);if(skipChars)skipChars--;i++;continue;}
      if(rest[0]==='*'){skip=true;i++;continue;}
      const match=rest.match(/^([a-z]+)(-?\d+)? ?/i);
      if(!match){i++;continue;}
      i+=match[0].length;const word=match[1],num=Number(match[2]||0);
      if(['fonttbl','colortbl','stylesheet','info','object','pict','header','footer'].includes(word)){skip=true;continue;}
      if(word==='bin'){i+=Math.max(0,num);continue;}
      if(word==='uc'){uc=num;continue;}
      if(skip)continue;
      if(word==='u'){paragraph+=escape(String.fromCharCode(num<0?num+65536:num));skipChars=uc;}
      else if(word==='par'){push();}
      else if(word==='line')paragraph+='<br>';
      else if(word==='tab')paragraph+='　';
      else if(word==='emdash')paragraph+='—';
      else if(word==='endash')paragraph+='–';
      else if(word==='bullet')paragraph+='•';
      else if(word==='cell')paragraph+='　│　';
      else if(word==='row')push();
      else if(word==='b')paragraph+=match[2]==='0'?'</strong>':'<strong>';
      else if(word==='i')paragraph+=match[2]==='0'?'</em>':'<em>';
      else if(word==='ul')paragraph+=match[2]==='0'?'</u>':'<u>';
      continue;
    }
    if(skipChars){skipChars--;continue;}
    if(!skip && c!=='\r'&&c!=='\n')paragraph+=escape(c);
  }
  push();return paragraphs.join('').replace(/LUMIPICTURE(\d+)END/g,(_,n)=>pictures[Number(n)]||'');
}
