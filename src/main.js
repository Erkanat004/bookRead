import './style.css';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { native, loadState, saveState, importNative, putFile, fileSource, removeFile, onAndroidBack, exitApp } from './storage.js';
import { MAX_FILE_SIZE, clamp, progress, cleanTitle, readableSize, orderedBooks } from './model.js';

GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
const $ = id => document.getElementById(id);
const paths = {
  plus:'M12 5v14M5 12h14', search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  moon:'M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z', sun:'M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  left:'m14 6-6 6 6 6', right:'m10 6 6 6-6 6', bookmark:'M6 3h12v18l-6-4-6 4Z',
  list:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1', more:'M5 12h.01M12 12h.01M19 12h.01'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
for (const [id, name] of Object.entries({add:'plus',searchIcon:'search',back:'left',bookmark:'bookmark',bookmarks:'list',previous:'left',next:'right'})) $(id).innerHTML = icon(name);
let state = { version:1, books:[] }, active = null, pdf = null, loadingTask = null, source = null;
let zoom = 1, renderJob = null, renderVersion = 0, opening = false, importing = false, storageReady = false;
let theme = localStorage.getItem('lumi-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
let toastTimer;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
function busy(value, text = 'Добавляем книгу…') { $('busyText').textContent = text; $('busy').hidden = !value; }
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('theme').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('theme').setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#181a19' : '#F6F3EC';
}
applyTheme();
$('theme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('lumi-theme', theme); applyTheme(); };
function cover(book) { return `<div class="cover">${book.cover ? `<img src="${escape(book.cover)}" alt="" loading="lazy" decoding="async">` : `<span class="cover-placeholder">${escape(book.title)}</span>`}</div>`; }
function paintLibrary() {
  const books = orderedBooks(state.books, $('search').value, $('sort').value);
  $('count').textContent = state.books.length;
  $('grid').innerHTML = books.map(b => `<article class="book-card"><button class="book-open" data-open="${b.id}" aria-label="Читать ${escape(b.title)}">${cover(b)}<h3 class="book-name">${escape(b.title)}</h3><p class="book-meta">${b.openedAt ? `${progress(b)}% прочитано` : `${b.pages} стр. · ${readableSize(b.size)}`}</p><div class="book-progress"><i style="width:${progress(b)}%"></i></div></button><button class="book-menu icon-button" data-menu="${b.id}" aria-label="Действия с книгой ${escape(b.title)}">${icon('more')}</button></article>`).join('');
  $('empty').hidden = !!state.books.length;
  if (!books.length && state.books.length) $('grid').innerHTML = '<p class="book-meta">Ничего не найдено. Попробуйте другое название.</p>';
  const last = [...state.books].filter(b => b.openedAt).sort((a,b) => b.openedAt-a.openedAt)[0];
  $('continueSection').hidden = !last || !!$('search').value;
  $('continue').innerHTML = last ? `<button class="continue-card" data-open="${last.id}" aria-label="Продолжить ${escape(last.title)}">${cover(last)}<div class="continue-info"><p class="eyebrow">СНОВА МЕЖДУ СТРОК</p><h3>${escape(last.title)}</h3><p>Страница ${last.page} из ${last.pages} · ${progress(last)}%</p><div class="book-progress"><i style="width:${progress(last)}%"></i></div></div><span class="continue-arrow">${icon('right')}</span></button>` : '';
}
$('search').oninput = paintLibrary; $('sort').onchange = paintLibrary;
$('library').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  const menu = event.target.closest('[data-menu]');
  if (open) openBook(open.dataset.open);
  if (menu) bookMenu(menu.dataset.menu);
});
async function persist() { try { await saveState(state); return true; } catch (e) { toast('Не удалось сохранить изменения. Проверьте свободную память.'); console.error(e); return false; } }
function showModal(html) { $('modalContent').innerHTML = html; if (!$('modal').open) $('modal').showModal(); }
$('closeModal').onclick = () => $('modal').close();
$('modal').onclick = event => { if (event.target === $('modal')) { const r = $('modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('modal').close(); } };
function bookMenu(id) {
  const b = state.books.find(b => b.id === id); if (!b) return;
  showModal(`<h2>${escape(b.title)}</h2><p>${b.pages} стр. · ${readableSize(b.size)}<br>Файл хранится на вашем устройстве.</p><button class="dialog-action" id="rename">Переименовать</button><button class="dialog-action danger" id="delete">Удалить книгу</button>`);
  $('rename').onclick = () => {
    showModal(`<h2>Название книги</h2><label for="newTitle" class="book-meta">Название</label><input class="dialog-input" id="newTitle" maxlength="160" value="${escape(b.title)}"><button class="primary" id="saveTitle">Сохранить</button>`);
    $('saveTitle').onclick = async () => { const title = $('newTitle').value.trim(); if (!title) return $('newTitle').focus(); const old = b.title; b.title = title; if (await persist()) { $('modal').close(); paintLibrary(); } else b.title = old; };
  };
  $('delete').onclick = () => {
    showModal(`<h2>Удалить книгу?</h2><p>«${escape(b.title)}», её прогресс и закладки будут удалены из LUMI. Исходный PDF в памяти телефона останется.</p><button class="primary" id="confirmDelete">Удалить из библиотеки</button>`);
    $('confirmDelete').onclick = async () => {
      $('confirmDelete').disabled = true;
      const old = state.books; state.books = state.books.filter(x => x.id !== id);
      if (!await persist()) { state.books = old; $('confirmDelete').disabled = false; return; }
      try { await removeFile(id); toast('Книга удалена'); } catch { toast('Книга удалена из списка. Не удалось удалить её локальную копию.'); }
      $('modal').close(); paintLibrary();
    };
  };
}
function pdfError(error) {
  if (error?.name === 'PasswordException') return 'PDF защищён паролем. Сохраните копию без пароля и добавьте её заново.';
  if (error?.name === 'InvalidPDFException') return 'PDF повреждён или имеет неподдерживаемый формат.';
  if (error?.name === 'QuotaExceededError') return 'Недостаточно места для книги. Освободите память устройства.';
  return error?.message || 'Не удалось открыть PDF. Проверьте файл и свободную память.';
}
function pdfTask(url) {
  return getDocument({ url, cMapUrl:'/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/pdfjs/standard_fonts/', wasmUrl:'/pdfjs/wasm/', isEvalSupported:false, enableXfa:false, disableAutoFetch:true, disableStream:true, rangeChunkSize:262144 });
}
async function importOne(info, file) {
  if (info.size > MAX_FILE_SIZE) throw new Error('Максимальный размер книги — 512 МБ.');
  if (file) { const head = new TextDecoder().decode(await file.slice(0,1024).arrayBuffer()); if (!head.includes('%PDF-')) throw new Error('Выбранный файл не является PDF.'); }
  let src, task, doc, committed = false;
  try {
    if (file) await putFile(info.id, file);
    src = await fileSource(info);
    task = pdfTask(src.url); doc = await task.promise;
    const page = await doc.getPage(1); const v = page.getViewport({scale:1});
    const canvas = document.createElement('canvas'); const viewport = page.getViewport({scale: Math.min(300/v.width,450/v.height)});
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
    const book = { id:info.id,title:cleanTitle(info.name).slice(0,160),size:info.size,pages:doc.numPages,page:1,bookmarks:[],cover:canvas.toDataURL('image/jpeg',.78),addedAt:Date.now(),openedAt:0 };
    canvas.width = canvas.height = 0;
    state.books.push(book);
    if (!await persist()) { state.books.pop(); throw new Error('Книга не сохранена: недостаточно памяти или ошибка хранилища.'); }
    committed = true; paintLibrary();
  } finally {
    if (task) await task.destroy().catch(() => {});
    if (src?.revoke) URL.revokeObjectURL(src.url);
    if (!committed) await removeFile(info.id).catch(() => {});
  }
}
async function addBooks() {
  if (importing || !storageReady) return;
  if (!native) return $('fileInput').click();
  importing = true;
  try {
    busy(true,'Копируем PDF в библиотеку…');
    // Native import is a streamed copy; no PDF bytes cross the Capacitor bridge.
    const info = await importNative();
    busy(true); await importOne(info); toast('Книга добавлена в библиотеку');
  } catch (e) { if (e.code !== 'CANCELLED') toast(pdfError(e)); }
  finally { importing = false; busy(false); }
}
$('add').onclick = addBooks; $('firstAdd').onclick = addBooks;
$('fileInput').onchange = async () => {
  if (importing) return; importing = true;
  const files = [...$('fileInput').files]; $('fileInput').value = '';
  for (let i=0;i<files.length;i++) {
    busy(true, `Добавляем книгу ${i+1} из ${files.length}…`);
    try { const file = files[i]; await importOne({id:crypto.randomUUID(),name:file.name,size:file.size},file); }
    catch(e) { toast(`${files[i].name}: ${pdfError(e)}`); }
  }
  importing = false; busy(false);
};
async function disposePdf() {
  renderVersion++; renderJob?.cancel(); renderJob = null;
  const task = loadingTask; loadingTask = null; pdf = null;
  if (task) await task.destroy().catch(() => {});
  if (source?.revoke) URL.revokeObjectURL(source.url);
  source = null; $('pageCanvas').width = $('pageCanvas').height = 0;
}
async function openBook(id) {
  if (opening || active) return; opening = true;
  const book = state.books.find(b => b.id === id); if (!book) { opening = false; return; }
  busy(true,'Открываем книгу…');
  try {
    source = await fileSource(book); loadingTask = pdfTask(source.url); pdf = await loadingTask.promise;
    active = book; active.pages = pdf.numPages; active.page = clamp(active.page,1,pdf.numPages); zoom = 1;
    $('readerTitle').textContent = active.title; $('reader').hidden = false; $('library').hidden = true;
    document.body.style.overflow = 'hidden'; await renderPage();
    active.openedAt = Date.now(); await persist();
    $('back').focus();
  } catch(e) { toast(pdfError(e)); active = null; await disposePdf(); $('reader').hidden = true; $('library').hidden = false; document.body.style.overflow = ''; }
  finally { busy(false); opening = false; }
}
async function closeReader() {
  if (opening || !active) return;
  await persist(); active = null;
  $('reader').hidden = true; $('library').hidden = false; document.body.style.overflow = '';
  await disposePdf(); paintLibrary(); $('add').focus();
}
$('back').onclick = closeReader;
function updateControls() {
  if (!active) return;
  $('pageNumber').textContent = `${active.page} / ${active.pages}`;
  $('readerSubtitle').textContent = `СТРАНИЦА ${active.page} ИЗ ${active.pages}`;
  $('progress').max = active.pages; $('progress').value = active.page;
  $('percent').textContent = `${progress(active)}% прочитано`;
  $('previous').disabled = active.page <= 1; $('next').disabled = active.page >= active.pages;
  $('zoomReset').textContent = `${Math.round(zoom*100)}%`;
  $('zoomOut').disabled = zoom <= 1; $('zoomIn').disabled = zoom >= 3;
  const marked = active.bookmarks.includes(active.page);
  $('bookmark').setAttribute('aria-pressed', marked);
  $('bookmark').setAttribute('aria-label',marked ? 'Удалить закладку' : 'Добавить закладку');
}
async function renderPage() {
  if (!pdf || !active) return false;
  const version = ++renderVersion; renderJob?.cancel();
  $('pageLoading').hidden = false;
  updateControls();
  const page = await pdf.getPage(active.page);
  if (version !== renderVersion) return false;
  const container = $('viewport');
  const natural = page.getViewport({scale:1});
  const fit = Math.min((container.clientWidth-32)/natural.width, (container.clientHeight-32)/natural.height);
  const cssScale = Math.max(.05,fit)*zoom;
  const cssViewport = page.getViewport({scale:cssScale});
  // Bound total pixel allocation, even at high DPR or for giant page dimensions.
  const dpr = Math.min(devicePixelRatio || 1,2,Math.sqrt(6000000/(cssViewport.width*cssViewport.height)));
  const viewport = page.getViewport({scale:cssScale*dpr});
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  canvas.style.width = `${cssViewport.width}px`; canvas.style.height = `${cssViewport.height}px`;
  renderJob = page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
  try {
    await renderJob.promise;
    if (version !== renderVersion) return false;
    const old = $('pageCanvas'); canvas.id = 'pageCanvas'; canvas.setAttribute('aria-label',`Страница ${active.page}`); old.replaceWith(canvas); old.width = old.height = 0;
    container.scrollTop = 0; container.scrollLeft = 0;
    // No full-document page cache on a low-memory device.
    page.cleanup(); return true;
  } catch(e) { if(e.name !== 'RenderingCancelledException') throw e; return false; }
  finally { if(version === renderVersion) { renderJob = null; $('pageLoading').hidden = true; } }
}
let turning = false;
async function goPage(number) {
  if (!active || turning || opening || zooming) return;
  const target = clamp(Math.round(number),1,active.pages); if(target === active.page) return;
  turning = true; const old = active.page; active.page = target;
  try { if (await renderPage()) { active.openedAt = Date.now(); await persist(); } }
  catch(e) { if(active) {active.page = old; updateControls();} toast(pdfError(e)); }
  finally { turning = false; $('pageLoading').hidden = true; }
}
$('previous').onclick = () => goPage(active.page-1); $('next').onclick = () => goPage(active.page+1);
$('progress').oninput = () => { if(active) $('pageNumber').textContent = `${$('progress').value} / ${active.pages}`; };
$('progress').onchange = () => goPage(Number($('progress').value));
$('pageNumber').onclick = () => {
  if(!active) return;
  showModal(`<h2>Перейти к странице</h2><label class="book-meta" for="jumpPage">От 1 до ${active.pages}</label><input id="jumpPage" class="dialog-input" type="number" min="1" max="${active.pages}" value="${active.page}"><button id="jump" class="primary">Перейти</button>`);
  $('jump').onclick = () => { const n = Number($('jumpPage').value); if(!Number.isInteger(n) || n < 1 || n > active.pages) { $('jumpPage').reportValidity(); return; } $('modal').close(); goPage(n); };
};
let zooming = false;
async function setZoom(value) { if(!active || opening || turning || zooming) return; zooming = true; zoom = clamp(value,1,3); try { await renderPage(); } catch(e) { toast(pdfError(e)); } finally { zooming = false; } }
$('zoomOut').onclick = () => setZoom(zoom-.25); $('zoomIn').onclick = () => setZoom(zoom+.25); $('zoomReset').onclick = () => setZoom(1);
$('bookmark').onclick = async () => {
  if(!active) return;
  const old = [...active.bookmarks]; const page = active.page;
  active.bookmarks = old.includes(page) ? old.filter(p => p !== page) : [...old,page].sort((a,b) => a-b);
  if(!await persist() && active) active.bookmarks = old;
  updateControls();
};
$('bookmarks').onclick = () => {
  if(!active) return;
  showModal(`<h2>Закладки</h2>${active.bookmarks.length ? active.bookmarks.map(page => `<button class="dialog-action" data-page="${page}">Страница ${page}${page === active.page ? ' · Вы здесь' : ''}</button>`).join('') : '<p>Сохраните важное место кнопкой закладки вверху экрана.</p>'}`);
  $('modalContent').querySelectorAll('[data-page]').forEach(button => button.onclick = () => { $('modal').close(); goPage(Number(button.dataset.page)); });
};
let touchStart = null, pinch = null;
$('viewport').addEventListener('touchstart',e => {
  if(e.touches.length === 2) { touchStart = null; pinch = {distance:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY), zoom}; }
  else if(e.touches.length === 1) touchStart = {x:e.touches[0].clientX,y:e.touches[0].clientY,time:Date.now()};
},{passive:true});
$('viewport').addEventListener('touchmove',e => {
  if(e.touches.length === 2 && pinch) { e.preventDefault(); pinch.target = pinch.zoom * Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/pinch.distance; }
},{passive:false});
$('viewport').addEventListener('touchend',e => {
  if(pinch) { if(!e.touches.length) { const target = pinch.target; pinch = null; if(target) setZoom(target); } return; }
  if(!touchStart || !active || zoom > 1.01) return;
  const dx = e.changedTouches[0].clientX-touchStart.x, dy = e.changedTouches[0].clientY-touchStart.y;
  if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.6 && Date.now()-touchStart.time<650) goPage(active.page + (dx<0 ? 1:-1));
  touchStart = null;
},{passive:true});
$('viewport').addEventListener('touchcancel',() => { touchStart = null; pinch = null; });
document.addEventListener('keydown',e => {
  if(!active || $('modal').open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if(e.key === 'ArrowRight') {e.preventDefault();goPage(active.page+1);}
  if(e.key === 'ArrowLeft') {e.preventDefault();goPage(active.page-1);}
  if(e.key === 'Escape') closeReader();
});
let resizeTimer;
window.addEventListener('resize',() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => {if(active) renderPage().catch(e => toast(pdfError(e)));},180); });
document.addEventListener('visibilitychange',() => {if(document.hidden && active) persist();});
onAndroidBack(() => { if($('modal').open) $('modal').close(); else if(!$('busy').hidden || opening) return; else if(active) closeReader(); else exitApp(); });
try { state = await loadState(); storageReady = true; paintLibrary(); }
catch(e) { $('add').disabled = $('firstAdd').disabled = true; toast(pdfError(e)); showModal('<h2>Библиотека недоступна</h2><p>Не удалось прочитать локальное хранилище. Перезапустите приложение и проверьте свободное место. Существующие данные не перезаписаны.</p>'); }
