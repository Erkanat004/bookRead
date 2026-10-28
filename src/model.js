export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const progress = book => !book.openedAt ? 0 : Math.round((book.unit && book.unit!=='Страница' ? book.page-1+(book.scroll||0) : book.page) / book.pages * 100);
export const cleanTitle = name => name.replace(/\.(fb2\.zip|pdf|epub|fb2|zip|txt|docx|odt|rtf|html?|md|markdown|cbz|png|jpe?g|webp|gif|bmp)$/i, '').replace(/[_]+/g, ' ').trim() || 'Без названия';
export function fileFormat(name) {
  if (/\.fb2\.zip$/i.test(name)) return 'fb2zip';
  const format = String(name).split('.').pop().toLowerCase();
  const formats = {pdf:'pdf',epub:'epub',fb2:'fb2',zip:'zip',txt:'txt',docx:'docx',odt:'odt',rtf:'rtf',html:'html',htm:'html',md:'md',markdown:'md',cbz:'cbz',png:'image',jpg:'image',jpeg:'image',webp:'image',gif:'image',bmp:'image'};
  if (!formats[format]) throw new Error('Этот формат пока не поддерживается. Выберите PDF, EPUB, FB2, FB2.ZIP, TXT, DOCX, ODT, RTF, HTML, MD или CBZ.');
  return formats[format];
}
export const readableSize = size => size < 1048576 ? `${Math.max(1, Math.round(size / 1024))} КБ` : size < 1073741824 ? `${(size / 1048576).toFixed(1)} МБ` : `${(size / 1073741824).toFixed(1)} ГБ`;
export function orderedBooks(books, query = '', sort = 'added') {
  return books.filter(b => b.title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ru') : sort === 'recent' ? (b.openedAt || 0) - (a.openedAt || 0) : b.addedAt - a.addedAt);
}
export function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.books)) throw new Error('Не удалось прочитать библиотеку. Данные не изменены.');
  for (const b of state.books) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(b.id) || typeof b.title !== 'string' || !Number.isInteger(b.pages) || b.pages < 1 || !Number.isInteger(b.page) || b.page < 1 || b.page > b.pages || !Array.isArray(b.bookmarks) || b.bookmarks.some(p => !Number.isInteger(p) || p < 1 || p > b.pages)) throw new Error('Повреждены данные библиотеки. Данные не изменены.');
  }
  return state;
}
