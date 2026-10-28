const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {zipSync,strToU8}=require('fflate');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const png=fs.readFileSync('android/app/src/main/res/mipmap-xhdpi/ic_launcher.png');
const imageData=`data:image/png;base64,${png.toString('base64')}`;
const zip=files=>Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,typeof v==='string'?strToU8(v):v]))));
const paragraph='Это настоящий текст книги: введение, иллюстрации и важные мысли. '.repeat(12);
const longHtml=Array.from({length:24},(_,i)=>`<p>${i+1}. ${paragraph}</p>`).join('');
const epub=zip({
 'mimetype':'application/epub+zip',
 'META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>',
 'OPS/package.opf':'<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Книга EPUB</dc:title><dc:creator>Автор книги</dc:creator></metadata><manifest><item id="intro" href="intro.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="intro"/><itemref idref="chapter"/></spine></package>',
 'OPS/intro.xhtml':`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="intro">Введение</h1><p>Иллюстрированное издание</p><figure><img src="images/cover.png" alt="Иллюстрация EPUB"/><figcaption>Подпись к иллюстрации</figcaption></figure><table><tr><th>Глава</th><th>Тема</th></tr><tr><td>Первая</td><td>Чтение</td></tr></table><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect x="2" y="2" width="196" height="56" fill="#d9bb80"/><text x="15" y="37" fill="#222">Схема книги</text></svg><math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>${longHtml}<a href="chapter.xhtml#chapter2">Следующая глава</a><script>window.__bookScript=true</script><img src="https://example.com/evil.png" alt="Внешний ресурс"/></body></html>`,
 'OPS/chapter.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="chapter2">Вторая глава</h1><p>Продолжение истории.</p></body></html>',
 'OPS/nav.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="intro.xhtml#intro">Введение</a></li><li><a href="chapter.xhtml#chapter2">Вторая глава</a></li></ol></nav></body></html>',
 'OPS/images/cover.png':png
});
const fb2=`<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>Книга FB2</book-title><author><first-name>Иван</first-name><last-name>Автор</last-name></author><annotation><p>Аннотация книги</p></annotation><coverpage><image l:href="#cover"/></coverpage></title-info></description><body><section><title><p>Введение FB2</p></title><p>Книга с <emphasis>иллюстрациями</emphasis>.</p><image l:href="#cover"/><table><tr><td>Таблица FB2</td></tr></table>${longHtml}</section></body><body name="notes"><section id="note1"><title><p>Примечания</p></title><p>Важное примечание</p></section></body><binary id="cover" content-type="image/png">${png.toString('base64')}</binary></FictionBook>`;
const docx=zip({
 'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Введение DOCX</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Выделенный текст</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="img1"/></w:drawing></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Таблица DOCX</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img1" Target="media/picture.png"/></Relationships>',
 'word/media/picture.png':png,
 'word/footnotes.xml':'<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Примечание DOCX</w:t></w:r></w:p></w:footnote></w:footnotes>',
 'docProps/core.xml':'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Книга DOCX</dc:title></cp:coreProperties>'
});
const odt=zip({'content.xml':'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><office:body><office:text><text:h>Введение ODT</text:h><text:p>Текст ODT</text:p><draw:frame><draw:image xlink:href="Pictures/picture.png"/></draw:frame><table:table><table:table-row><table:table-cell><text:p>Таблица ODT</text:p></table:table-cell></table:table-row></table:table></office:text></office:body></office:document-content>','Pictures/picture.png':png});
const cases=[
 ['EPUB.epub',epub,'Книга EPUB','Введение',true,true],
 ['FB2.fb2',Buffer.from(fb2),'Книга FB2','Введение FB2',true,true],
 ['Архив.fb2.zip',zip({'book.fb2':fb2}),'Книга FB2','Введение FB2',true,true],
 ['Документ.docx',docx,'Книга DOCX','Введение DOCX',true,true],
 ['Документ ODT.odt',odt,'Документ ODT','Введение ODT',true,true],
 ['Документ HTML.html',Buffer.from(`<h1>Введение HTML</h1><p>Текст HTML</p><img src="${imageData}"><table><tr><td>Таблица HTML</td></tr></table><script>window.__bookScript=true</script>`),'Документ HTML','Введение HTML',true,true],
 ['Документ RTF.rtf',Buffer.from(`{\\rtf1\\ansi Introduction RTF\\par {\\pict\\pngblip ${png.toString('hex')}}\\par Text RTF}`),'Документ RTF','Introduction RTF',true,false],
 ['Заметки.md',Buffer.from('# Введение Markdown\n\nТекст Markdown'),'Заметки','Введение Markdown',false,false],
 ['Текст.txt',Buffer.from('Введение TXT\n\n'+paragraph.repeat(100)),'Текст','Введение TXT',false,false],
 ['Комикс.cbz',zip({'page10.png':png,'page2.png':png,'page1.png':png}),'Комикс','',true,false],
 ['Изображение.png',png,'Изображение','',true,false]
];
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1|blob:|data:)/.test(r.url()))external.push(r.url());});
  await page.goto(process.env.LUMI_URL||'http://127.0.0.1:4180/');
  await page.getByRole('heading',{name:'Моя библиотека.'}).waitFor();
  for(const [name,buffer,title,phrase,hasImage,hasTable] of cases){
   const before=await page.locator('.book-card').count();
   await page.locator('#fileInput').setInputFiles({name,mimeType:'application/octet-stream',buffer});
   await page.locator('#busy').waitFor({state:'hidden'});
   assert.equal(await page.locator('.book-card').count(),before+1,`${name}: ${await page.locator('#toast').textContent()}`);
   await page.locator('.book-card').first().getByRole('button',{name:`Читать ${title}`,exact:true}).click();
   await page.locator('#busy').waitFor({state:'hidden'});
   assert.equal(await page.locator('#reader').isVisible(),true,`${name}: ${await page.locator('#toast').textContent()}`);
   if(phrase)assert.match(await page.locator('#textPage').textContent(),new RegExp(phrase));
   if(hasImage){assert.ok(await page.locator('#textPage img').count()>0,name+' image missing');assert.equal(await page.locator('#textPage img').first().evaluate(img=>img.complete&&img.naturalWidth>0),true,name+' image broken');}
   if(hasTable)assert.ok(await page.locator('#textPage table').count()>0,name+' table missing');
   if(name==='EPUB.epub'){
    assert.equal(await page.locator('#textPage svg').count(),1);assert.equal(await page.locator('#textPage math').count(),1);
    await page.screenshot({path:'test-results/epub-illustrated.png'});
    await page.locator('#viewport').evaluate(el=>{el.scrollTop=(el.scrollHeight-el.clientHeight)*.45;});await page.waitForTimeout(700);
    await page.getByRole('button',{name:'Добавить закладку'}).click();
    await page.getByRole('button',{name:'Вернуться в библиотеку'}).click();await page.reload();
    await page.getByRole('button',{name:'Продолжить Книга EPUB'}).click();await page.locator('#busy').waitFor({state:'hidden'});
    assert.ok(await page.locator('#viewport').evaluate(el=>el.scrollTop/(el.scrollHeight-el.clientHeight))>.35,'EPUB scroll position lost');
    await page.getByRole('button',{name:'Оглавление',exact:true}).click();await page.getByRole('button',{name:'Вторая глава',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#textPage').textContent.includes('Продолжение истории.'));
    await page.getByRole('button',{name:'Увеличить размер текста'}).click();
    await page.waitForFunction(()=>document.querySelector('#zoomReset').textContent!=='18 пт');
   }
   if(name==='Комикс.cbz'){assert.equal(await page.locator('#pageNumber').textContent(),'1 / 3');await page.getByRole('button',{name:'Следующая страница'}).click();await page.waitForFunction(()=>document.querySelector('#pageNumber').textContent==='2 / 3');}
   assert.equal(await page.evaluate(()=>window.__bookScript),undefined,'Book scripts executed');
   await page.getByRole('button',{name:'Вернуться в библиотеку'}).click();
   console.log('PASS:',name,'text, images and structure');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: 11 formats; introduction, images, tables, EPUB SVG/MathML/contents, persistent position, font sizing, comic navigation; no book scripts or external requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
