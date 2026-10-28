// Optional end-to-end test; keep Playwright outside the app's production dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
function samplePdf(title='A quiet chapter', color='0.20 0.30 0.26') {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>'];
  for(let n=0;n<3;n++) {
    const content = `${color} rg 0 0 420 600 re f 0.9 0.82 0.65 RG 30 30 360 540 re S BT /F1 27 Tf 0.94 0.89 0.78 rg 45 450 Td (${title}) Tj 0 -60 Td /F1 14 Tf (LUMI READER - PAGE ${n+1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 600] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4+n*2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  let pdf = '%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i) => { offsets.push(Buffer.byteLength(pdf)); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`);
  return Buffer.from(pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
}
(async () => {
  fs.mkdirSync('test-results',{recursive:true});
  const options = {headless:true};
  if(process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const errors = [], external = [];
    const page = await context.newPage();
    page.on('pageerror',e => errors.push(e.message));
    page.on('console',m => { if(m.type() === 'error' || m.type() === 'warning') console.log('browser:',m.text()); });
    page.on('request',r => { if(!/^(http:\/\/127\.0\.0\.1|blob:|data:)/.test(r.url())) external.push(r.url()); });
    await page.goto(process.env.LUMI_URL || 'http://127.0.0.1:4173/');
    await page.getByRole('heading',{name:'Моя библиотека.'}).waitFor();
    await page.screenshot({path:'test-results/empty-light.png',fullPage:true});
    await page.locator('#fileInput').setInputFiles([
      {name:'Тихая глава.pdf',mimeType:'application/pdf',buffer:samplePdf()},
      {name:'Время для себя.pdf',mimeType:'application/pdf',buffer:samplePdf('Time for yourself','0.45 0.23 0.18')}
    ]);
    await page.locator('#busy').waitFor({state:'hidden'});
    if(await page.locator('.book-card').count() !== 2) console.log('Import feedback:',await page.locator('#toast').textContent(),errors);
    assert.equal(await page.locator('.book-card').count(),2);
    await page.getByRole('button',{name:'Читать Тихая глава',exact:true}).click();
    await page.locator('#busy').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Следующая страница'}).click();
    await page.waitForFunction(() => document.querySelector('#pageNumber').textContent === '2 / 3' && document.querySelector('#pageLoading').hidden);
    await page.getByRole('button',{name:'Добавить закладку'}).click();
    await page.waitForFunction(() => document.querySelector('#bookmark').getAttribute('aria-pressed') === 'true');
    await page.getByRole('button',{name:'Увеличить масштаб'}).click();
    await page.waitForFunction(() => document.querySelector('#zoomReset').textContent === '125%' && document.querySelector('#pageLoading').hidden);
    await page.getByRole('button',{name:'Сбросить масштаб'}).click();
    await page.waitForFunction(() => document.querySelector('#zoomReset').textContent === '100%' && document.querySelector('#pageLoading').hidden);
    await page.screenshot({path:'test-results/reader-light.png'});
    await page.getByRole('button',{name:'Вернуться в библиотеку'}).click();
    await page.locator('#library').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Включить тёмную тему'}).click();
    await page.reload();
    await page.getByRole('button',{name:'Продолжить Тихая глава'}).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.waitForTimeout(350);
    await page.screenshot({path:'test-results/library-dark.png',fullPage:true});
    // Simulate the APK: deny external network, keep the packaged localhost assets available.
    // setOffline(true) would also block the preview server, unlike Android's intercepted asset URLs.
    await context.route('**/*',route => /^http:\/\/127\.0\.0\.1/.test(route.request().url()) ? route.continue() : route.abort());
    await page.getByRole('button',{name:'Продолжить Тихая глава'}).click();
    await page.locator('#busy').waitFor({state:'hidden'});
    assert.equal(await page.locator('#pageNumber').textContent(),'2 / 3');
    assert.equal(await page.locator('#bookmark').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Открыть закладки'}).click();
    await page.getByRole('button',{name:'Страница 2 · Вы здесь'}).click();
    await page.getByRole('button',{name:'Перейти к странице'}).click();
    await page.locator('#jumpPage').fill('3'); await page.getByRole('button',{name:'Перейти',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#pageNumber').textContent === '3 / 3' && document.querySelector('#pageLoading').hidden);
    assert.equal(await page.locator('#next').isDisabled(),true);
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(350);
    await page.screenshot({path:'test-results/reader-landscape.png'});
    await page.getByRole('button',{name:'Вернуться в библиотеку'}).click();
    await page.setViewportSize({width:375,height:812});
    await page.getByRole('button',{name:'Включить светлую тему'}).click();
    await page.waitForTimeout(350);
    await page.screenshot({path:'test-results/library-light.png',fullPage:true});
    await page.locator('#search').fill('ТИХАЯ'); assert.equal(await page.locator('.book-card').count(),1);
    await page.locator('#search').fill('Несуществующая'); assert.equal(await page.locator('.book-card').count(),0);
    await page.locator('#search').fill('');
    await page.getByRole('button',{name:'Действия с книгой Тихая глава'}).click();
    await page.getByRole('button',{name:'Переименовать',exact:true}).click();
    await page.locator('#newTitle').fill('Новая глава'); await page.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.getByRole('button',{name:'Действия с книгой Новая глава'}).waitFor();
    await page.getByRole('button',{name:'Действия с книгой Новая глава'}).click();
    await page.getByRole('button',{name:'Удалить книгу',exact:true}).click();
    await page.getByRole('button',{name:'Удалить из библиотеки'}).click();
    await page.locator('#modal').waitFor({state:'hidden'}); assert.equal(await page.locator('.book-card').count(),1);
    await page.locator('#fileInput').setInputFiles({name:'Ошибка.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
    await page.locator('#busy').waitFor({state:'hidden'});
    assert.match(await page.locator('#toast').textContent(),/не является PDF/);
    await page.reload(); await page.locator('.book-card').waitFor(); assert.equal(await page.locator('.book-card').count(),1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.book-card').evaluate(el => getComputedStyle(el).animationName),'none');
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    console.log('PASS: import, cover, render, paging, zoom, bookmarks, persisted resume, offline reading, theme, search, rename, delete, invalid PDF, mobile/landscape, reduced motion; no external requests or JS errors.');
    await context.close();
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
