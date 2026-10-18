import { Text, Link } from './Typography';
import { Ionicons } from '@expo/vector-icons';

import { Pressable, StyleSheet, View } from 'react-native';
import { categoryInfo, theme } from '../theme';
import { localDate, displayDate, displayTime, type AgendaEntry } from '../utils/dashboard';
export function AgendaCard({ entry, today = false }: { entry: AgendaEntry; today?: boolean }) {
  const overdue = entry.kind === 'task' && entry.date < localDate(new Date());
  const category = categoryInfo(entry.item.category);
  const pendingTask = entry.item.tasks.filter(task => !task.completed && task.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  return <Link href={{ pathname: '/items/[id]', params: { id: entry.item.id } }} asChild><Pressable accessibilityLabel={`${entry.item.title}, ${entry.kind === 'task' ? 'deadline' : 'event'}, ${displayDate(entry.date)}`} style={s.card}>
    <View style={s.top}><View style={[s.badge, { backgroundColor: category.background }]}><Ionicons name={category.icon} size={12} color={category.color} /><Text style={[s.badgeText, { color: category.color }]}>{category.label}</Text></View><Ionicons name="arrow-forward" size={17} color="#8A9382" /></View>
    <Text style={s.title}>{entry.item.title}</Text>
    <View style={s.meta}><Ionicons name={entry.kind === 'task' ? 'hourglass-outline' : 'calendar-outline'} size={14} color={theme.colors.muted} /><Text style={[s.metaText, overdue && { color: '#A33158' }]}>{overdue ? `Overdue · ${displayDate(entry.date)}` : today ? `Today · ${displayDate(entry.date)}` : displayDate(entry.date)}{entry.kind === 'event' ? ` · ${displayTime(entry.time)}` : ' · Deadline'}</Text></View>
    {entry.kind === 'event' && entry.item.event?.location && <Text style={s.location}>{entry.item.event.location}</Text>}
    <View style={s.footer}><Ionicons name={entry.kind === 'task' || pendingTask ? 'ellipse-outline' : 'sparkles-outline'} size={13} color={entry.kind === 'task' ? '#A3783D' : theme.colors.green} /><Text style={[s.footerText, entry.kind === 'task' && { color: '#966B31' }]}>{entry.taskTitle ?? (pendingTask ? `${pendingTask.title} · due ${displayDate(pendingTask.due_date!)}` : 'View event')}</Text></View>
  </Pressable></Link>;
}
const s = StyleSheet.create({ card: { flex: 1, minWidth: 0, padding: 16, borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.card, backgroundColor: 'white', gap: 9 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 }, badgeText: { fontSize: 10, fontWeight: '600' }, title: {  fontSize: 17, fontWeight: '700', color: theme.colors.ink, lineHeight: 23, letterSpacing: 0 }, meta: { flexDirection: 'row', gap: 7, alignItems: 'center' }, metaText: { fontSize: 12, color: theme.colors.muted }, location: { fontSize: 11, color: theme.colors.muted, marginTop: -5, paddingLeft: 21 }, footer: { marginTop: 'auto', paddingTop: 14, borderTopWidth: 1, borderColor: theme.colors.line, flexDirection: 'row', gap: 7, alignItems: 'center' }, footerText: { fontSize: 11, color: theme.colors.purple, flexShrink: 1, lineHeight: 17 } });
