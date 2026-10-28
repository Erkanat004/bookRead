import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {FileReader,ZipArchive,resolvePath} from '../src/archive.js';
import {fileFormat,cleanTitle,readableSize} from '../src/model.js';
import {decodeText,rtfHtml} from '../src/ebooks.js';
test('ZIP reads named entries and preserves image bytes without extracting unrelated files',async()=>{
  const data=zipSync({'chapter.xml':strToU8('<p>Введение</p>'),'image.png':Uint8Array.from([137,80,78,71,1,2,3]),'unused.dat':new Uint8Array(100000)});
  const zip=await new ZipArchive(new FileReader({blob:new Blob([data])},data.length)).open();
  assert.equal(zip.entries.size,3);assert.equal(await (await zip.read('chapter.xml')).text(),'<p>Введение</p>');
  assert.deepEqual(new Uint8Array(await (await zip.read('image.png')).arrayBuffer()),Uint8Array.from([137,80,78,71,1,2,3]));
  await assert.rejects(()=>zip.read('missing.xml'));
});
test('Range reader requests only the needed bytes in a virtual 8 GB file',async()=>{
  const size=8*1024**3;const requests=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{requests.push(options.headers.Range);return new Response(Uint8Array.from([1,2,3,4]),{status:206});};
  try{const bytes=await new FileReader({url:'https://localhost/book'},size).read(size-4,size);assert.equal(bytes.length,4);assert.deepEqual(requests,[`bytes=${size-4}-${size-1}`]);}
  finally{globalThis.fetch=originalFetch;}
});
test('Archive paths resolve internal images and reject external or escaping references',()=>{
  assert.equal(resolvePath('OPS/Text/chapter.xhtml','../Images/picture.png'),'OPS/Images/picture.png');
  assert.equal(resolvePath('OPS/chapter.xhtml','../../secret'),null);
  assert.equal(resolvePath('OPS/chapter.xhtml','https://example.com/image.png'),null);
});
test('Formats and titles include documents, comics and pictures without a file-size gate',()=>{
  assert.equal(fileFormat('Книга.FB2.ZIP'),'fb2zip');assert.equal(fileFormat('книга.DOCX'),'docx');assert.equal(fileFormat('схема.PNG'),'image');assert.equal(fileFormat('комикс.cbz'),'cbz');
  assert.equal(cleanTitle('Моя_книга.fb2.zip'),'Моя книга');assert.equal(readableSize(8*1024**3),'8.0 ГБ');assert.throws(()=>fileFormat('book.exe'));
});
test('Russian encodings and RTF unicode preserve actual content and hide control groups',()=>{
  assert.equal(decodeText(Uint8Array.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2])),'Привет');
  const html=rtfHtml('{\\rtf1{\\fonttbl SHOULDNOTAPPEAR}\\uc1\\u1042?\\u1074?\\u1077?\\u1076?\\u1077?\\u1085?\\u1080?\\u1077?\\par Text}');
  assert.match(html,/Введение/);assert.doesNotMatch(html,/SHOULDNOTAPPEAR/);
});
