import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterGallery, galleryEntries } from '../src/utils/gallery.ts';
import { pixieReducer, type PixieState } from '../src/state/model.ts';
import { analyzeScreenshot, saveMockItem, patchMockItem } from '../src/services/mockApi.ts';
import type { SavedItem, AnalyzeResponse } from '../src/types/api.ts';
const base: SavedItem = { id: 'a', title: 'Campus Workshop', category: 'campus_events', summary: 'Creative computing', event: { date: '2026-10-25', time: null, location: 'Klaus', registration_url: null }, tasks: [{ title: 'Register', due_date: '2026-10-17' }], image_url: '/api/images/a', created_at: '2026-10-15T12:00:00Z', confirmed: true };
const undated: SavedItem = { ...base, id: 'b', title: 'Undated', image_url: '/api/images/b', category: 'personal', event: null, created_at: '2026-10-16T12:00:00Z' };
const earlier: SavedItem = { ...base, id: 'c', image_url: '/api/images/c', event: { ...base.event!, date: '2026-10-20' }, created_at: '2026-10-14T12:00:00Z' };
const draft: AnalyzeResponse = { draft_id: 'd', image_url: '/api/drafts/d/image', extracted_text: 'robotics invitation', item: { title: 'Pending', category: 'other', summary: '', event: null, tasks: [] } };
test('gallery shares saved items/drafts, resolves actual images and marks unconfirmed routes', () => {
  const image = { uri: 'data:image/png;base64,original', name: 'flyer.png' };
  const entries = galleryEntries([base, { ...undated, confirmed: false }], [draft], { [base.image_url]: image });
  assert.equal(entries[0].image, image); assert.equal(entries[0].route, '/items/[id]'); assert.equal(entries[1].needsReview, true); assert.equal(entries[1].route, '/confirmation/[id]'); assert.equal(entries[2].route, '/confirmation/[id]'); assert.equal(entries[2].id, 'd');
});
test('search covers title, summary, location, tasks and extracted text; combines category', () => {
  const entries = galleryEntries([base, undated], [draft], {});
  for (const query of [' WORKSHOP ', 'computing', 'klaus', 'register']) assert.ok(filterGallery(entries, 'campus_events', query, 'newest').some(entry => entry.id === 'a'));
  assert.equal(filterGallery(entries, 'other', 'robotics', 'newest')[0].id, 'd');
  assert.equal(filterGallery(entries, 'personal', 'workshop', 'newest').length, 0);
  assert.equal(filterGallery([], 'all', '', 'newest').length, 0);
});
test('event sort uses event dates, ignores task deadlines and leaves undated records last', () => {
  const entries = galleryEntries([undated, base, earlier], [draft], {});
  assert.deepEqual(filterGallery(entries, 'all', '', 'event').map(entry => entry.id), ['c', 'a', 'd', 'b']);
});
test('upload sorting supports both directions and does not invent missing draft timestamps', () => {
  const entries = galleryEntries([base, undated, earlier], [draft], {});
  assert.deepEqual(filterGallery(entries, 'all', '', 'newest').map(entry => entry.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(filterGallery(entries, 'all', '', 'oldest').map(entry => entry.id), ['c', 'a', 'b', 'd']);
  const actualUpload = galleryEntries([base], [], { [base.image_url]: { uri: 'data:original', name: 'file.png', uploaded_at: '2026-10-01T12:00:00Z' } });
  assert.equal(actualUpload[0].created_at, '2026-10-01T12:00:00Z');
});
test('confirm, edit and restore appear in the gallery without duplicates or lost images', () => {
  const pending = analyzeScreenshot('my-image.png', 'd_new');
  const image = { uri: 'data:image/png;base64,original', name: 'my-image.png', uploaded_at: '2026-10-17T12:00:00Z' };
  let state: PixieState = { version: 1, items: [], drafts: [], images: {} };
  state = pixieReducer(state, { type: 'draft', draft: pending, image });
  assert.equal(galleryEntries(state.items, state.drafts, state.images)[0].needsReview, true);
  state = pixieReducer(state, { type: 'confirm', draft_id: pending.draft_id, item: saveMockItem({ draft_id: pending.draft_id, item: pending.item }, 'i_new') });
  state = pixieReducer(state, { type: 'updateItem', item: patchMockItem(state.items[0], { title: 'Edited title', category: 'career', event: { date: '2026-10-25', time: null, location: null, registration_url: null } }) });
  state = JSON.parse(JSON.stringify(state));
  const entries = filterGallery(galleryEntries(state.items, state.drafts, state.images), 'career', 'Edited', 'event');
  assert.equal(entries.length, 1); assert.equal(entries[0].id, 'i_new'); assert.equal(entries[0].image?.uri, image.uri); assert.equal(entries[0].needsReview, false); assert.equal(entries[0].item.event?.date, '2026-10-25');
});
