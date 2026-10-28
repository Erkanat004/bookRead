import { Capacitor, registerPlugin } from '@capacitor/core';
import { validateState } from './model.js';
export const native = Capacitor.isNativePlatform();
const Files = registerPlugin('LumiFiles');
let dbPromise;
function database() {
  return dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('lumi-reader', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('files'); request.result.createObjectStore('settings'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation(store, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить данные.'));
  });
}
export async function loadState() {
  const raw = native ? (await Files.load()).json : await operation('settings', 'readonly', s => s.get('library'));
  return raw ? validateState(JSON.parse(raw)) : { version: 1, books: [] };
}
let writeQueue = Promise.resolve();
export function saveState(state) {
  const json = JSON.stringify(state);
  const next = writeQueue.catch(() => {}).then(() => native ? Files.save({ json }) : operation('settings', 'readwrite', s => s.put(json, 'library')));
  writeQueue = next;
  return next;
}
export async function importNative() { return Files.pick(); }
export async function putFile(id, file) {
  await operation('files', 'readwrite', s => s.put(file, id));
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => {});
}
export async function fileSource(book) {
  if (native) return { url: Capacitor.convertFileSrc((await Files.locate({ id: book.id })).path) };
  const blob = await operation('files', 'readonly', s => s.get(book.id));
  if (!blob) throw new Error('Файл книги не найден. Добавьте его заново.');
  return { url: URL.createObjectURL(blob), revoke: true };
}
export async function removeFile(id) {
  if (native) await Files.remove({ id });
  else await operation('files', 'readwrite', s => s.delete(id));
}
export function onAndroidBack(callback) {
  if (native) return Files.addListener('back', callback);
}
export async function exitApp() { if (native) await Files.exit(); }
