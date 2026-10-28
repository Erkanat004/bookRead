import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedBooks, validateState, progress, clamp, cleanTitle } from '../src/model.js';
const book = {id:'test-1',title:'Книга',pages:10,page:3,bookmarks:[],addedAt:1,openedAt:4};
test('Resume progress is based on last rendered page; unopened books stay at zero',() => {
  assert.equal(progress(book),30); assert.equal(progress({...book,openedAt:0}),0);
  assert.equal(clamp(99,1,10),10); assert.equal(clamp(-2,1,10),1);
});
test('Search works with Russian case and surrounding whitespace without mutating library',() => {
  const books = [book,{...book,id:'test-2',title:'Другая история',addedAt:3}];
  assert.deepEqual(orderedBooks(books,' КНИ '),[book]);
  assert.equal(orderedBooks(books)[0].id,'test-2'); assert.equal(books[0].id,'test-1');
});
test('Corrupt metadata cannot silently overwrite existing library',() => {
  assert.throws(() => validateState({version:2,books:[]}));
  assert.throws(() => validateState({version:1,books:[{...book,id:'../escape'}]}));
  assert.throws(() => validateState({version:1,books:[{...book,page:11}]}));
  assert.equal(validateState({version:1,books:[book]}).books[0],book);
});
test('File title normalization preserves user text',() => {
  assert.equal(cleanTitle('Тихий_Дон.PDF'),'Тихий Дон'); assert.equal(cleanTitle('.pdf'),'Без названия');
});
