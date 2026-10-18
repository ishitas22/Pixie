import type { Category } from '../types/api';
export const theme = {
  colors: { background: '#FFFCF8', surface: '#FFFFFF', ink: '#30283F', muted: '#756B80', line: '#EEE6F0', green: '#69509A', paleGreen: '#F0E9FF', purple: '#69509A', pink: '#FF80BD', teal: '#60DCD1', lavender: '#B7A0F8', yellow: '#FFE38B' },
  radius: { card: 20, control: 12 },
  spacing: { xs: 6, sm: 12, md: 20, lg: 32, xl: 48 },
};
export const categories: { id: Category | 'all'; label: string; color: string; background: string; icon: 'grid-outline' | 'school-outline' | 'briefcase-outline' | 'leaf-outline' | 'heart-outline' | 'shapes-outline' }[] = [
  { id: 'all', label: 'All', color: '#69509A', background: '#F0E9FF', icon: 'grid-outline' },
  { id: 'campus_events', label: 'Campus Events', color: '#644491', background: '#EAE0FF', icon: 'school-outline' },
  { id: 'career', label: 'Career Opportunities', color: '#79551B', background: '#FFF0BB', icon: 'briefcase-outline' },
  { id: 'extracurriculars', label: 'Extracurriculars', color: '#226C65', background: '#D1F6F1', icon: 'leaf-outline' },
  { id: 'personal', label: 'Personal', color: '#913A68', background: '#FFE0EF', icon: 'heart-outline' },
  { id: 'other', label: 'Other', color: '#675B85', background: '#EEE8F8', icon: 'shapes-outline' },
];
export const categoryInfo = (id: Category) => categories.find(category => category.id === id)!;
