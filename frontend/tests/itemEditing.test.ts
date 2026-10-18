import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, isIsoDate, parseDate } from '../src/utils/dates.ts';
import { toApiItem, toItemForm } from '../src/utils/itemForm.ts';
import { patchMockItem } from '../src/services/mockApi.ts';
import { pixieReducer, type PixieState } from '../src/state/model.ts';
import { getAgenda } from '../src/utils/dashboard.ts';
import type { SavedItem } from '../src/types/api.ts';
const original: SavedItem = { id: 'i_edit', image_url: '/api/images/i_edit', created_at: '2026-10-17T12:00:00Z', confirmed: true, title: 'Before', category: 'career', summary: '', event: { date: '2026-10-25', time: '17:00', location: null, registration_url: null }, tasks: [{ id: 't_keep', title: 'Keep', due_date: '2026-10-25', completed: false }, { id: 't_remove', title: 'Remove', due_date: null, completed: false }] };
test('display dates round trip exactly and accept leap years without timezone shifts', () => {
  for (const [iso, display] of [['2026-10-25', '10/25/2026'], ['2028-02-29', '02/29/2028'], ['2000-02-29', '02/29/2000'], ['2026-01-01', '01/01/2026']]) { assert.equal(formatDate(iso), display); assert.equal(parseDate(display), iso); }
  for (const display of ['02/31/2026', '02/29/2026', '02/29/1900', '04/31/2026', '10/00/2026', '13/25/2026', '1/2/2026', '2026-10-25', '10/25/0000']) assert.equal(parseDate(display), null);
  assert.equal(formatDate(null), ''); assert.equal(formatDate('2026-02-30'), ''); assert.equal(isIsoDate('2026-02-30'), false);
});
test('form converts event dates and deadlines to ISO; rejects invalid input instead of saving stale dates', () => {
  const form = toItemForm(original);
  assert.equal(form.event?.date, '10/25/2026'); assert.equal(form.tasks[0].due_date, '10/25/2026');
  form.event!.date = '02/31/2026'; form.tasks[0].due_date = '02/29/2026';
  assert.deepEqual(Object.keys(toApiItem(form, true).dateErrors), ['date', 'due_0']);
  form.event!.date = '02/29/2028'; form.tasks[0].due_date = '';
  const converted = toApiItem(form, true); assert.deepEqual(converted.errors, {}); assert.equal(converted.item.event?.date, '2028-02-29'); assert.equal(converted.item.tasks[0].due_date, null); assert.equal(converted.item.tasks[0].id, 't_keep');
});
test('PATCH edits existing item; preserves metadata/image/status, removes and adds tasks, retains completion', () => {
  const patch = { title: 'After', category: 'personal' as const, tasks: [{ ...original.tasks[0], completed: true }, { title: 'New task', due_date: '2026-10-26' }] };
  const edited = patchMockItem(original, patch);
  assert.equal(edited.id, original.id); assert.equal(edited.image_url, original.image_url); assert.equal(edited.confirmed, true); assert.equal(edited.created_at, original.created_at); assert.equal(edited.event, original.event);
  assert.equal(edited.tasks.length, 2); assert.equal(edited.tasks[0].id, 't_keep'); assert.equal(edited.tasks[0].completed, true); assert.notEqual(edited.tasks[1].id, 't_remove'); assert.ok(edited.tasks[1].id); assert.equal(edited.tasks[1].completed, false);
  assert.equal(original.tasks[0].completed, false); assert.equal(original.title, 'Before');
  const again = patchMockItem(edited, { summary: 'Another edit' }); assert.equal(again.tasks[0].completed, true);
  assert.equal(patchMockItem({ ...original, confirmed: false }, { title: 'Still unconfirmed' }).confirmed, false);
});
test('save updates reducer in place and dashboard date/category/deadline grouping; pending drafts unchanged', () => {
  const image = { uri: 'data:image/png;base64,sample', name: 'screenshot.png' };
  const state: PixieState = { version: 1, items: [original], drafts: [], images: { [original.image_url]: image } };
  const changed = patchMockItem(original, { category: 'personal', event: { ...original.event!, date: '2026-10-27' }, tasks: [{ ...original.tasks[0], completed: true }] });
  const updated = pixieReducer(state, { type: 'updateItem', item: changed });
  assert.equal(updated.items.length, 1); assert.equal(updated.items[0].id, original.id); assert.equal(updated.images[original.image_url], image); assert.equal(updated.drafts, state.drafts);
  assert.equal(getAgenda(updated.items, '2026-10-25', 'career').upcoming.length, 0);
  const agenda = getAgenda(updated.items, '2026-10-25', 'personal'); assert.equal(agenda.today.length, 0); assert.deepEqual(agenda.upcoming.map(entry => entry.date), ['2026-10-27']);
  assert.deepEqual(pixieReducer(state, { type: 'hydrate', state: JSON.parse(JSON.stringify(updated)) }), updated);
});
test('canceling local form edits cannot mutate the saved item or nested tasks', () => {
  const form = toItemForm(original); form.title = 'Canceled'; form.event!.date = '10/17/2026'; form.tasks[0].completed = true; form.tasks.splice(1, 1);
  assert.equal(original.title, 'Before'); assert.equal(original.event!.date, '2026-10-25'); assert.equal(original.tasks[0].completed, false); assert.equal(original.tasks.length, 2);
});
