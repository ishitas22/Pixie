import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft, validateDraft, validDate, validUrl } from '../src/utils/confirmation.ts';
import { analyzeScreenshot, saveMockItem, validateImageMetadata } from '../src/services/mockApi.ts';
import { pixieReducer, type PixieState } from '../src/state/model.ts';
import { getAgenda } from '../src/utils/dashboard.ts';
const draft = analyzeScreenshot('screenshot.png', 'd_test');
const state: PixieState = { version: 1, items: [], drafts: [], images: {} };
test('mock analysis preserves contract fields, with no invented event information', () => {
  assert.deepEqual(draft, { draft_id: 'd_test', image_url: '/api/drafts/d_test/image', extracted_text: '', item: { title: 'screenshot', category: 'other', summary: '', event: null, tasks: [] } });
});
test('optional fields normalize to null; undated items can be confirmed', () => {
  const item = normalizeDraft({ ...draft.item, event: { date: '', time: '', location: ' ', registration_url: '' }, tasks: [{ title: ' Check flyer ', due_date: '' }] });
  assert.equal(item.event, null); assert.equal(item.tasks[0].due_date, null); assert.equal(item.tasks[0].title, 'Check flyer'); assert.deepEqual(validateDraft(item), {});
});
test('validates real dates, times, task titles and safe registration URLs', () => {
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2028-02-29'), true); assert.equal(validDate('10/17/2026'), false);
  assert.equal(validUrl('javascript:alert(1)'), false); assert.equal(validUrl('example.com'), false); assert.equal(validUrl('https://example.com/register'), true);
  const errors = validateDraft({ ...draft.item, title: '', event: { date: '2026-02-30', time: '25:00', location: null, registration_url: 'bad-url' }, tasks: [{ title: '', due_date: '2026-13-01' }] });
  assert.deepEqual(Object.keys(errors).sort(), ['date', 'due_0', 'registration_url', 'task_0', 'time', 'title']);
});
test('draft edits persist through state transitions; saving moves image and avoids duplicates', () => {
  const image = { uri: 'data:image/png;base64,sample', name: 'screenshot.png' };
  let collection = pixieReducer(state, { type: 'draft', draft, image });
  assert.equal(collection.items.length, 0); assert.equal(getAgenda(collection.items, '2026-10-17').today.length, 0);
  const edited = { ...draft, item: { ...draft.item, category: 'career' as const, event: { date: '2026-10-17', time: '10:00', location: null, registration_url: null }, tasks: [{ title: 'Register', due_date: '2026-10-17' }] } };
  collection = pixieReducer(collection, { type: 'edit', draft: edited });
  assert.equal(collection.drafts[0].item.category, 'career');
  const saved = saveMockItem({ draft_id: draft.draft_id, item: edited.item }, 'i_test');
  collection = pixieReducer(collection, { type: 'confirm', draft_id: draft.draft_id, item: saved });
  assert.equal(collection.drafts.length, 0); assert.equal(collection.items.length, 1); assert.equal(collection.images['/api/images/i_test'], image); assert.equal(collection.images[draft.image_url], undefined);
  assert.equal(saved.confirmed, true); assert.equal(saved.tasks[0].completed, false); assert.ok(saved.tasks[0].id);
  assert.equal(getAgenda(collection.items, '2026-10-17', 'career').today.length, 2);
  assert.equal(pixieReducer(collection, { type: 'confirm', draft_id: draft.draft_id, item: saved }), collection);
  assert.deepEqual(pixieReducer(state, { type: 'hydrate', state: JSON.parse(JSON.stringify(collection)) }), collection);
});
test('rejects invalid types, empty files and files above 10MB', () => {
  assert.throws(() => validateImageMetadata('text/plain', 'flyer.png', 12)); assert.throws(() => validateImageMetadata('image/png', 'flyer.png', 0)); assert.throws(() => validateImageMetadata('image/jpeg', 'flyer.jpg', 11 * 1024 * 1024)); assert.doesNotThrow(() => validateImageMetadata('image/jpeg', 'flyer.jpg', 100));
});
