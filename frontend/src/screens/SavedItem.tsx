import { Text, Link } from '../components/Typography';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { ItemEditor } from '../components/ItemEditor';
import { ScreenshotPreview } from '../components/ScreenshotPreview';
import { usePixie } from '../state/PixieProvider';
import { categoryInfo, theme } from '../theme';
import { displayDate, displayTime } from '../utils/dashboard';
import { validUrl } from '../utils/confirmation';
export default function SavedItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, ready, updateItem } = usePixie();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const wide = useWindowDimensions().width >= 1100;
  const item = state.items.find(item => item.id === id);
  if (!ready) return <AppShell><ActivityIndicator color={theme.colors.purple} /></AppShell>;
  if (!item) return <AppShell><Text style={s.title}>Item not found</Text><Link href="/" style={s.link}>Back to dashboard</Link></AppShell>;
  return <AppShell><Link href="/" style={s.link}>← Dashboard</Link><View style={{ flexDirection: wide ? 'row' : 'column', gap: 28, marginTop: 24 }}><View style={{ width: wide ? '43%' : '100%' }}><ScreenshotPreview image={state.images[item.image_url]} /></View>{editing ? <ItemEditor key={item.id} initial={item} savedItem onCancel={() => setEditing(false)} onSave={patch => { updateItem(item.id, patch); setEditing(false); setSaved(true); }} /> : <View style={s.panel}>{saved && <Text role="status" style={s.badge}>Changes saved</Text>}<Pressable accessibilityRole="button" accessibilityLabel="Edit item" onPress={() => { setEditing(true); setSaved(false); }} style={{ alignSelf: 'flex-end', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: theme.colors.pink }}><Text style={{ color: theme.colors.ink, fontWeight: '600' }}>Edit</Text></Pressable><Text style={s.badge}>SAVED · {categoryInfo(item.category).label}</Text><Text role="heading" aria-level={1} style={s.title}>{item.title}</Text>{item.summary ? <Text style={s.body}>{item.summary}</Text> : null}<Text style={s.section}>Event information</Text><Text style={s.body}>{item.event?.date ? displayDate(item.event.date) : 'No event date'}{item.event?.time ? ` · ${displayTime(item.event.time)}` : ''}</Text>{item.event?.location ? <Text style={s.body}>{item.event.location}</Text> : null}{item.event?.registration_url && validUrl(item.event.registration_url) ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(item.event!.registration_url!)}><Text style={s.link}>Registration link ↗</Text></Pressable> : null}<Text style={s.section}>Tasks</Text>{item.tasks.length ? [...item.tasks].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')).map((task, index) => <Text key={task.id ?? index} style={s.body}>{task.completed ? '✓' : '○'} {task.title}{task.due_date ? ` · due ${displayDate(task.due_date)}` : ''}</Text>) : <Text style={s.body}>No tasks added.</Text>}<Text style={s.note}>Demo collection · saved locally. Saving does not register you for an event. Tasks are completed only when you mark them complete.</Text></View>}</View></AppShell>;
}
const s = StyleSheet.create({ panel: { flex: 1, minWidth: 0, backgroundColor: 'white', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.line, padding: 24, gap: 18 }, title: { fontFamily: 'PixieHeading', color: theme.colors.ink, fontSize: 29, fontWeight: '700', lineHeight: 38 }, badge: { color: '#226C65', backgroundColor: '#D1F6F1', borderRadius: 9, padding: 9, fontSize: 11, alignSelf: 'flex-start' }, body: { color: theme.colors.muted, fontSize: 14, lineHeight: 23 }, section: { fontFamily: 'PixieHeading', color: theme.colors.ink, fontSize: 17, fontWeight: '800', marginTop: 12 }, link: { color: theme.colors.purple, fontSize: 13, fontWeight: '600',}, note: { fontSize: 11, lineHeight: 19, color: theme.colors.muted, marginTop: 20 } });
