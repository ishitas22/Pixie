import type { AnalyzeResponse, Category, SavedItem } from '../types/api';
import { dateOffset } from '../utils/dashboard';
// These are GET /api/items records and POST /api/analyze responses, not UI-shaped objects.
export function createMockData(now = new Date()): { items: SavedItem[]; drafts: AnalyzeResponse[] } {
  function item(id: string, title: string, category: Category, days: number | null, time: string | null, location: string | null, task?: { title: string; days: number; completed?: boolean }): SavedItem {
    return { id, title, category, summary: `A little opportunity worth saving: ${title}.`, image_url: `/api/images/${id}`, created_at: now.toISOString(), confirmed: true,
      event: days === null ? null : { date: dateOffset(now, days), time, location, registration_url: null },
      tasks: task ? [{ id: `task_${id}`, title: task.title, due_date: dateOffset(now, task.days), completed: task.completed ?? false }] : [] };
  }
  return {
    items: [
      item('i_101', 'A little coffee, a lot of ideas', 'campus_events', 0, '10:00', 'Student Center · The Commons'),
      item('i_102', 'Design your next chapter', 'career', 0, '16:30', 'Klaus Building · Room 1447', { title: 'Save your spot', days: -1, completed: true }),
      item('i_103', 'Summer internship applications', 'career', null, null, null, { title: 'Submit your application', days: 0 }),
      item('i_104', 'Create something good', 'extracurriculars', 1, '14:00', 'Arts Studio · West Campus'),
      item('i_105', 'AI Career Workshop', 'career', 5, '17:00', 'Klaus Building', { title: 'Register for workshop', days: 2 }),
      item('i_106', 'Sunday reset & farmers market', 'personal', 3, '09:00', 'Piedmont Park'),
      item('i_107', 'A night under the stars', 'campus_events', 6, '19:30', 'Campus Observatory'),
      item('i_108', 'Useful things for later', 'other', null, null, null),
    ],
    drafts: [
      { draft_id: 'd_201', image_url: '/api/drafts/d_201/image', extracted_text: 'Fall Makers Market. Handmade goods, good company.', item: { title: 'Fall Makers Market', category: 'campus_events', summary: 'A market featuring local student makers.', event: { date: dateOffset(now, 7), time: '12:00', location: 'Tech Green', registration_url: null }, tasks: [] } },
      { draft_id: 'd_202', image_url: '/api/drafts/d_202/image', extracted_text: 'Build with us. Creative Computing Club.', item: { title: 'Creative Computing Club', category: 'extracurriculars', summary: 'An invitation to build something together.', event: null, tasks: [{ title: 'Check the interest form', due_date: null }] } },
    ],
  };
}
