import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateOffset, daySnap, getAgenda, localDate } from '../src/utils/dashboard.ts';
import type { SavedItem } from '../src/types/api.ts';
const record: SavedItem = { id: 'i_test', image_url: '/api/images/i_test', created_at: '2026-10-17T12:00:00Z', confirmed: true, title: 'Workshop', category: 'career', summary: '', event: { date: '2026-10-19', time: '17:00', location: null, registration_url: null }, tasks: [{ id: 't1', title: 'Register', due_date: '2026-10-17', completed: false }] };
test('a future event with a task due today appears in both correct sections', () => { const result = getAgenda([record], '2026-10-17'); assert.equal(result.today[0].kind, 'task'); assert.equal(result.upcoming[0].date, '2026-10-19'); });
test('completed and undated tasks and unconfirmed items do not enter agenda', () => { assert.deepEqual(getAgenda([{ ...record, event: null, tasks: [{ title: 'Done', due_date: '2026-10-17', completed: true }, { title: 'Unknown', due_date: null }] }, { ...record, confirmed: false }], '2026-10-17'), { today: [], upcoming: [] }); });
test('category filters apply to events and deadlines', () => { assert.deepEqual(getAgenda([record], '2026-10-17', 'personal'), { today: [], upcoming: [] }); });
test('future deadlines sort before later events; timed events sort by time', () => { const result = getAgenda([record, { ...record, id: 'earlier', event: { ...record.event!, time: '09:00' }, tasks: [{ title: 'Apply', due_date: '2026-10-18' }] }], '2026-10-17'); assert.deepEqual(result.upcoming.map(entry => entry.date), ['2026-10-18', '2026-10-19', '2026-10-19']); assert.equal(result.upcoming[1].time, '09:00'); });
test('date offsets use local calendar days across month and year boundaries', () => { assert.equal(dateOffset(new Date(2026, 11, 31, 12), 1), '2027-01-01'); assert.equal(localDate(new Date('2026-01-01T04:30:00Z')), '2025-12-31'); assert.equal(localDate(new Date('2026-01-01T05:30:00Z')), '2026-01-01'); });
test('day snap uses today items and one undated task', () => {
  const snap = daySnap([record, { ...record, id: 'later', event: null, tasks: [{ id: 'later-task', title: 'Read the flyer', due_date: null }] }], '2026-10-17');
  assert.equal(snap.count, 1);
  assert.equal(snap.lines[0].kind, 'task');
  assert.equal(snap.lines[0].title, 'Register');
  assert.equal(snap.later?.title, 'Read the flyer');
  assert.equal(daySnap([record], '2026-10-16').later, null);
});

test('overdue tasks lead Today, future deadlines are chronological, completed tasks stay out', () => { const result = getAgenda([{ ...record, event: null, tasks: [{ title: 'Soon', due_date: '2026-10-18' }, { title: 'Overdue', due_date: '2026-10-15' }, { title: 'Today', due_date: '2026-10-17' }, { title: 'Done', due_date: '2026-10-14', completed: true }] }], '2026-10-17'); assert.deepEqual(result.today.map(entry => entry.taskTitle), ['Overdue', 'Today']); assert.deepEqual(result.upcoming.map(entry => entry.taskTitle), ['Soon']); });
