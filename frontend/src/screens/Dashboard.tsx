import { Text, Link } from '../components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { AgendaCard } from '../components/AgendaCard';
import { DaySnap } from '../components/DaySnap';
import { DropSurface } from '../components/DropSurface';
import { usePixie } from '../state/PixieProvider';
import { categoryInfo, theme } from '../theme';
import type { Category } from '../types/api';
import { displayDate, getAgenda, localDate, pendingTasks, type AgendaEntry } from '../utils/dashboard';
export default function Dashboard() {
  const { category: requestedCategory, saved } = useLocalSearchParams<{ category?: string; saved?: string }>();
  const category: Category | 'all' = ['all', 'campus_events', 'career', 'extracurriculars', 'personal', 'other'].includes(requestedCategory ?? '') ? requestedCategory as Category | 'all' : 'all';
  const setCategory = (next: Category | 'all') => router.setParams({ category: next });
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => { const timer = setInterval(() => setToday(localDate(new Date())), 30000); return () => clearInterval(timer); }, []);
  const { state: data, ready, upload, pickScreenshot, ingestFiles, completeTask } = usePixie();
  const agenda = getAgenda(data.items, today, category);
  const tasks = pendingTasks(data.items, category);
  const drafts = data.drafts.filter(draft => category === 'all' || draft.item.category === category);
  const { width } = useWindowDimensions();
  const wide = width >= 1150;
  const date = displayDate(today);
  return <AppShell selected={category} onCategory={setCategory}>
    {!ready ? <ActivityIndicator accessibilityLabel="Loading your collection" color={theme.colors.purple} style={{ marginBottom: 16 }} /> : null}
    <DropSurface label="upload or drag and drop image here" disabled={!ready || upload.busy} onFiles={files => void ingestFiles(files)} style={s.hero} activeStyle={{ borderColor: theme.colors.lavender, borderWidth: 2 }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <View style={[s.doodle, { left: '9%', top: 25 }]}><Ionicons name="sparkles" size={38} color={theme.colors.pink} /></View>
        <View style={[s.doodle, { right: '10%', top: 30 }]}><Ionicons name="star-outline" size={33} color="#9071CC" /></View>
        <View style={[s.doodle, { left: '16%', bottom: 25 }]}><Ionicons name="ellipse-outline" size={22} color="#28AFA1" /></View>
        <View style={[s.doodle, { right: '17%', bottom: 25 }]}><Ionicons name="flower-outline" size={30} color="#C6972B" /></View>
      </View>
      <Text role="heading" aria-level={1} style={[s.heroWordmark, width < 600 && { fontSize: 60, lineHeight: 76 }]}>Pixie<Text style={{ color: '#DC4F95', fontSize: 35 }}>✦</Text></Text>
      <Text style={s.heroTagline}>A little magic for your camera roll</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="upload or drag and drop image here" disabled={!ready || upload.busy} onPress={pickScreenshot} style={s.heroButton}><Ionicons name="add" size={18} color={theme.colors.ink} /><Text style={s.heroButtonText}>upload or drag and drop image here</Text></Pressable>
    </DropSurface>
    {saved && data.items.some(item => item.id === saved) && <View style={{ padding: 14, backgroundColor: '#D1F6F1', borderRadius: 12, marginBottom: 18 }}><Text style={{ color: '#226C65', fontSize: 13 }}>Saved to your collection! {data.items.find(item => item.id === saved)?.title}</Text><Link href={{ pathname: '/items/[id]', params: { id: saved } }} style={{ color: theme.colors.purple, marginTop: 8 }}>View saved screenshot →</Link></View>}
    <Text style={s.dateLabel}>{date}</Text>
    {category !== 'all' && <View style={s.filterRow}><Text style={s.subtitle}>Showing {categoryInfo(category).label}</Text><Pressable onPress={() => setCategory('all')} accessibilityRole="button"><Text style={{ color: theme.colors.green, fontSize: 12 }}>Clear filter ×</Text></Pressable></View>}
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 30, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, width: '100%', minWidth: 0 }}>
        <SectionTitle title="Today" count={agenda.today.length} />
        <DaySnap items={data.items} today={today} category={category} />
        <AgendaGrid entries={agenda.today} today />
        <View style={{ height: 24 }} />
        <SectionTitle title="Upcoming" count={agenda.upcoming.length} />
        <AgendaGrid entries={agenda.upcoming} />
        <View style={{ marginTop: 30 }}><SectionTitle title="Your Tasks" count={tasks.length} />{tasks.length ? <View style={{ gap: 10 }}>{tasks.map(({ item, task, index }) => <View key={`${item.id}-${task.id ?? index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: theme.colors.line }}><Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete task: ${task.title}`} accessibilityState={{ checked: false }} onPress={() => completeTask(item.id, index)} style={{ width: 28, height: 28, borderWidth: 2, borderColor: '#B7A0F8', borderRadius: 8, backgroundColor: '#F7F1FF' }} /><Link href={{ pathname: '/items/[id]', params: { id: item.id } }} asChild><Pressable accessibilityLabel={`${task.title}, from ${item.title}`} style={{ flex: 1, gap: 5 }}><Text style={{ fontSize: 15, lineHeight: 23, fontWeight: '700', color: theme.colors.ink }}>{task.title}</Text><Text style={{ fontSize: 12, lineHeight: 19, color: task.due_date && task.due_date < today ? '#A33158' : theme.colors.muted }}>{task.due_date ? `${task.due_date < today ? 'Overdue · ' : 'Due '}${displayDate(task.due_date)}` : 'No due date'}</Text><Text style={{ fontSize: 12, color: theme.colors.purple }}>{item.title} →</Text></Pressable></Link></View>)}</View> : <View style={{ padding: 28, borderRadius: 18, backgroundColor: '#EAF6F3', alignItems: 'center' }}><Text style={{ fontSize: 17, lineHeight: 26, textAlign: 'center', color: '#226C65' }}>All caught up! No pending tasks{category !== 'all' ? ' in this category' : ''}.</Text></View>}</View>
      </View>
      <View style={[s.reviewColumn, !wide && { width: '100%' }]}>
        <View style={[s.reviewHeader, { marginBottom: 18 }]}><Text role="heading" aria-level={2} style={s.reviewTitle}>Needs Review</Text><View style={s.reviewCount}><Text style={{ color: '#79551B', fontSize: 11 }}>{drafts.length}</Text></View></View>
        {drafts.map((draft, index) => <Link key={draft.draft_id} href={{ pathname: '/confirmation/[id]', params: { id: draft.draft_id } }} asChild><Pressable style={s.reviewCard}>
          {data.images[draft.image_url] ? <Image source={{ uri: data.images[draft.image_url].uri }} accessibilityLabel={`Screenshot awaiting review: ${draft.item.title}`} resizeMode="contain" style={{ height: 145, width: '100%', backgroundColor: '#F0E9FF' }} /> : <View style={[s.poster, { backgroundColor: index % 2 === 0 ? '#FFF0BB' : '#EAE0FF' }]}><Text style={s.posterKicker}>SOMETHING WORTH DISCOVERING</Text><Ionicons name={index % 2 === 0 ? 'flower-outline' : 'planet-outline'} size={40} color={index % 2 === 0 ? '#846327' : '#8060B4'} /><Text style={s.posterTitle}>{draft.item.title || 'Untitled screenshot'}</Text><Text style={s.posterCaption}>PIXIE COLLECTION  /  0{index + 1}</Text></View>}
          <View style={{ padding: 15, gap: 8 }}><Text style={s.reviewItemTitle}>{draft.item.title || 'Untitled screenshot'}</Text><Text style={s.reviewHint}>{draft.processing_status && draft.processing_status !== 'ready' ? 'Could not interpret · open to retry' : 'Waiting for your review'}</Text><View style={s.reviewLink}><Text style={{ fontSize: 12, fontWeight: '600', color: '#78658E' }}>Review details</Text><Ionicons name="arrow-forward" size={15} color="#78658E" /></View></View>
        </Pressable></Link>)}
        {drafts.length === 0 && <View style={{ minHeight: 230, justifyContent: 'center', alignItems: 'center', padding: 18 }}><Text style={{ fontSize: 19, lineHeight: 29, textAlign: 'center', fontWeight: '600', color: theme.colors.ink }}>All clear here! No drafts in this category.</Text></View>}
        
      </View>
    </View>
    {data.items.some(item => data.images[item.image_url] && (category === 'all' || item.category === category)) && <View style={{ marginTop: 30, gap: 12 }}><Text role="heading" aria-level={2} style={s.sectionTitle}>Your saved screenshots</Text>{data.items.filter(item => data.images[item.image_url] && (category === 'all' || item.category === category)).map(item => <Link key={item.id} href={{ pathname: '/items/[id]', params: { id: item.id } }} style={{ padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, color: theme.colors.purple }}>{item.title} · {categoryInfo(item.category).label} →</Link>)}</View>}
    <View style={s.bottom}><Text style={s.demo}>Stored on this computer</Text></View>
  </AppShell>;
}
function SectionTitle({ title, count }: { title: string; count: number }) { return <View style={s.section}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Text role="heading" aria-level={2} style={s.sectionTitle}>{title}</Text><Text style={s.sectionCount}>{count}</Text></View></View>; }
function AgendaGrid({ entries, today = false }: { entries: AgendaEntry[]; today?: boolean }) {
  const columns = useWindowDimensions().width >= 650 ? 2 : 1;
  return <View style={s.grid}>{entries.map(entry => <View key={entry.key} style={{ width: columns === 2 ? '48.5%' : '100%', alignSelf: 'stretch' }}><AgendaCard entry={entry} today={today} /></View>)}{entries.length === 0 && <View style={s.emptyBox}><Ionicons name="leaf-outline" size={25} color="#85936A" /><Text style={s.empty}>{today ? 'A little breathing room. Nothing due today.' : 'No upcoming dates in this category yet.'}</Text></View>}</View>;
}
const s = StyleSheet.create({
  hero: { position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(214, 196, 245, 0.72)', borderWidth: 1, borderColor: '#EBDDFA', borderRadius: 26, paddingHorizontal: 18, paddingVertical: 20, marginBottom: 20, gap: 9 },
  doodle: { position: 'absolute', opacity: 0.8 },
  heroWordmark: { fontSize: 84, lineHeight: 104, fontWeight: '700', letterSpacing: 3, color: theme.colors.ink, fontFamily: 'PixieWordmark' },
  heroTagline: { fontSize: 17, lineHeight: 24, textAlign: 'center', color: '#63516F', fontWeight: '500' },
  heroButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.colors.pink, borderWidth: 1, borderColor: '#E868A7', borderRadius: 14, paddingHorizontal: 19, paddingVertical: 12, marginTop: 5 },
  heroButtonText: { fontSize: 13, fontWeight: '600', color: theme.colors.ink },
  dateLabel: { fontSize: 11, color: theme.colors.muted, marginBottom: 18 },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 21, marginTop: 7 }, section: { gap: 7, marginBottom: 18 }, sectionTitle: { fontFamily: 'PixieHeading', fontSize: 25, lineHeight: 34, letterSpacing: 0, fontWeight: '800', color: theme.colors.ink }, sectionCount: { fontSize: 11, color: '#69509A', backgroundColor: '#F0E9FF', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  reviewColumn: { width: 252, backgroundColor: '#FFF8E5', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#F0E3BC' }, reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, reviewTitle: { fontFamily: 'PixieHeading', fontSize: 18, lineHeight: 26, fontWeight: '800', color: theme.colors.ink, letterSpacing: 0 }, reviewCount: { backgroundColor: '#FFE38B', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }, reviewSubtitle: { color: '#756B80', fontSize: 11, marginTop: 8, marginBottom: 18, lineHeight: 17 }, reviewCard: { borderRadius: 13, overflow: 'hidden', backgroundColor: 'white', borderWidth: 1, borderColor: '#EEE6F0', marginBottom: 15 }, poster: { padding: 16, alignItems: 'center', gap: 12 }, posterKicker: { fontSize: 7, letterSpacing: 1.5, color: '#86836F', textAlign: 'center' }, posterTitle: {  fontSize: 20, color: '#50405E', textAlign: 'center', lineHeight: 24, fontWeight: '700',}, posterCaption: { fontSize: 7, letterSpacing: 1.7, color: '#8C8B7A' }, reviewItemTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.ink }, reviewHint: { fontSize: 10, color: '#96938A' }, reviewLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }, reviewFootnote: { fontSize: 10, color: '#969180', textAlign: 'center', marginVertical: 5 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 }, emptyBox: { width: '100%', padding: 25, borderWidth: 1, borderColor: theme.colors.line, borderStyle: 'dashed', borderRadius: 16, alignItems: 'center', gap: 12 }, empty: { fontSize: 12, color: theme.colors.muted, lineHeight: 20 }, bottom: { flexDirection: 'row', gap: 7, marginTop: 40, flexWrap: 'wrap', alignItems: 'center' }, demo: { color: '#969C8E', fontSize: 10, marginLeft: 'auto' },
});
