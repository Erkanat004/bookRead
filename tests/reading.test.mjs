import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReading,DEFAULT_READING} from '../src/reading-settings.js';
test('Saved typography values are bounded and unknown settings fall back safely',()=>{
  assert.deepEqual(normalizeReading(),DEFAULT_READING);
  const result=normalizeReading({font:'https://example.com/font',size:200,line:0,margin:-20,paper:'sepia',mode:'pages',animation:'none'});
  assert.equal(result.font,'book');assert.equal(result.size,42);assert.equal(result.line,1.35);assert.equal(result.margin,12);assert.equal(result.paper,'sepia');assert.equal(result.animation,'none');
});
