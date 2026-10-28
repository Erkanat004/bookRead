export const MAX_FILE_SIZE = 512 * 1024 * 1024;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const progress = book => book.openedAt ? Math.round(book.page / book.pages * 100) : 0;
export const cleanTitle = name => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Без названия';
export const readableSize = size => size < 1048576 ? `${Math.max(1, Math.round(size / 1024))} КБ` : `${(size / 1048576).toFixed(1)} МБ`;
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
