import { Inflate } from 'fflate/browser';

/** Reads only the requested part of a private Android file or a browser Blob. */
export class FileReader {
  constructor(source, size) { this.source = source; this.size = size; }
  async read(begin, end) {
    begin = Math.max(0, begin); end = Math.min(this.size, end);
    if (end <= begin) return new Uint8Array();
    if (this.source.blob) return new Uint8Array(await this.source.blob.slice(begin,end).arrayBuffer());
    const response = await fetch(this.source.url,{headers:{Range:`bytes=${begin}-${end-1}`}});
    if (!response.ok) throw new Error('Не удалось прочитать часть файла. Проверьте доступ к книге.');
    if (response.status !== 206) throw new Error('Хранилище не поддерживает чтение файла по частям.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== end-begin) throw new Error('Файл книги обрезан или повреждён.');
    return bytes;
  }
}
const u16 = (b,o) => new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(o,true);
const u32 = (b,o) => new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(o,true);
function u64(b,o) {
  const n = Number(new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(o,true));
  if (!Number.isSafeInteger(n)) throw new Error('Архив превышает адресуемый размер.');
  return n;
}
export function resolvePath(base, reference) {
  const clean = decodeURIComponent(reference.split('#')[0].split('?')[0]);
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(clean)) return null;
  const parts = clean.startsWith('/') ? [] : base.split('/').slice(0,-1);
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if(!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}
export class ZipArchive {
  constructor(reader) { this.reader = reader; this.entries = new Map(); }
  async open() {
    const tailStart = Math.max(0,this.reader.size-65558);
    const tail = await this.reader.read(tailStart,this.reader.size);
    let e = tail.length-22;
    for (;e>=0;e--) if(u32(tail,e)===0x06054b50 && e+22+u16(tail,e+20)===tail.length) break;
    if (e<0) throw new Error('Не удалось прочитать ZIP-структуру книги.');
    let count = u16(tail,e+10), offset = u32(tail,e+16);
    if (u16(tail,e+4) || u16(tail,e+6)) throw new Error('Многотомные архивы не поддерживаются.');
    if (count===65535 || offset===0xffffffff) {
      const locator = await this.reader.read(tailStart+e-20,tailStart+e);
      if(u32(locator,0)!==0x07064b50) throw new Error('Повреждён ZIP64-архив.');
      const recordOffset = u64(locator,8);
      const record = await this.reader.read(recordOffset,recordOffset+56);
      if(u32(record,0)!==0x06064b50) throw new Error('Повреждён ZIP64-архив.');
      count=u64(record,32); offset=u64(record,48);
    }
    // Keep the index lightweight even when the book contains very large images.
    let buffer = new Uint8Array(), position = offset;
    const need = async length => {
      while(buffer.length<length) {
        const bytes=await this.reader.read(position,Math.min(this.reader.size,position+65536));
        if(!bytes.length) throw new Error('Обрезан каталог архива.');
        const joined=new Uint8Array(buffer.length+bytes.length);joined.set(buffer);joined.set(bytes,buffer.length);buffer=joined;position+=bytes.length;
      }
    };
    for(let i=0;i<count;i++) {
      await need(46);
      if(u32(buffer,0)!==0x02014b50) throw new Error('Повреждён каталог архива.');
      const nameLength=u16(buffer,28), extraLength=u16(buffer,30), commentLength=u16(buffer,32), length=46+nameLength+extraLength+commentLength;
      await need(length);
      const name=new TextDecoder().decode(buffer.subarray(46,46+nameLength));
      let compressed=u32(buffer,20), size=u32(buffer,24), start=u32(buffer,42);
      let x=46+nameLength;
      while(x+4<=46+nameLength+extraLength) {
        const tag=u16(buffer,x), len=u16(buffer,x+2);x+=4;
        if(tag===1) {let p=x;if(size===0xffffffff){size=u64(buffer,p);p+=8;}if(compressed===0xffffffff){compressed=u64(buffer,p);p+=8;}if(start===0xffffffff)start=u64(buffer,p);}
        x+=len;
      }
      if(!name.startsWith('/') && !name.split('/').includes('..') && !name.includes('\\') && !name.endsWith('/')) this.entries.set(name,{name,compressed,size,start,method:u16(buffer,10),flags:u16(buffer,8)});
      buffer=buffer.slice(length);
      if(i%512===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    return this;
  }
  async read(name) {
    const e=this.entries.get(name);if(!e) throw new Error(`В архиве отсутствует файл: ${name}`);
    if(e.flags&1) throw new Error('Зашифрованный архив не поддерживается.');
    if(![0,8].includes(e.method)) throw new Error('Этот метод сжатия архива не поддерживается.');
    // This is a per-document working-memory budget, not a book/archive file-size limit.
    const budget=Math.max(64,Math.min(192,(globalThis.navigator?.deviceMemory||4)*24))*1048576;
    if(e.size>budget) throw new Error('В книге есть отдельная глава или изображение, для обработки которого не хватает рабочей памяти. Размер всей книги не ограничен.');
    const header=await this.reader.read(e.start,e.start+30);
    if(u32(header,0)!==0x04034b50) throw new Error('Повреждён элемент архива.');
    const begin=e.start+30+u16(header,26)+u16(header,28);
    const chunks=[];let total=0;
    const append=bytes=>{total+=bytes.length;if(total>e.size || total>budget)throw new Error('Некорректный размер элемента архива.');chunks.push(bytes);};
    const inflater=e.method===8 ? new Inflate(bytes=>append(bytes)) : null;
    for(let offset=0;offset<e.compressed;offset+=65536) {
      const bytes=await this.reader.read(begin+offset,begin+Math.min(e.compressed,offset+65536));
      if(inflater) {for(let i=0;i<bytes.length;i+=4096) inflater.push(bytes.subarray(i,i+4096),offset+i+4096>=e.compressed);}
      else append(bytes);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(total!==e.size) throw new Error('Элемент архива обрезан или повреждён.');
    return new Blob(chunks);
  }
}
