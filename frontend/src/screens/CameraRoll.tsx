import { Text, TextInput } from '../components/Typography';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { messageOf } from '../api';
import { AppShell } from '../components/AppShell';
import { GalleryCard } from '../components/GalleryCard';
import { usePixie } from '../state/PixieProvider';
import { confirmBulkDelete } from '../utils/confirmDelete';
import { categories, theme } from '../theme';
import type { Category } from '../types/api';
import { filterGallery, galleryEntries, type GallerySort } from '../utils/gallery';
const sorts: { id: GallerySort; label: string }[] = [{ id: 'newest', label: 'Newest upload' }, { id: 'oldest', label: 'Oldest upload' }, { id: 'event', label: 'Upcoming event (soonest first)' }];
export default function CameraRoll() {
  const { state, ready, pickScreenshot, upload, removeScreenshot } = usePixie();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GallerySort>('newest');
  const [width, setWidth] = useState(0);
  const entries = galleryEntries(state.items, state.drafts, state.images);
  const visible = filterGallery(entries, category, search, sort);
  const columns = width >= 1100 ? 4 : width >= 780 ? 3 : width >= 500 ? 2 : 1;
  const [deleteError, setDeleteError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  function clear() { setSearch(''); setCategory('all'); }
  function leaveSelection() { setSelecting(false); setSelected([]); }
  function toggleSelected(screenshotId: string) {
    setSelected(current => current.includes(screenshotId) ? current.filter(id => id !== screenshotId) : [...current, screenshotId]);
  }
  async function deleteSelected() {
    if (selected.length === 0) return;
    if (!confirmBulkDelete()) return;
    setDeleteError('');
    const pending = [...selected];
    try {
      while (pending.length > 0) {
        await removeScreenshot(pending[0]);
        pending.shift();
      }
      leaveSelection();
    } catch (error) {
      setDeleteError(messageOf(error));
      setSelected([...pending]);
    }
  }
  return <AppShell><View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', gap: 22 }}>
    <View style={s.header}><View style={{ flex: 1, minWidth: 200, gap: 8 }}><Text role="heading" aria-level={1} style={s.heading}>Camera Roll<Text style={{ color: theme.colors.pink }}>✦</Text></Text></View><Pressable accessibilityRole="button" accessibilityLabel="Upload to Camera Roll" disabled={!ready || upload.busy} onPress={pickScreenshot} style={s.upload}><Ionicons name="add" size={18} color={theme.colors.ink} /><Text style={s.uploadText}>Upload</Text></Pressable></View>
    <View style={s.search}><Ionicons name="search-outline" size={19} color={theme.colors.purple} /><TextInput accessibilityLabel="Search screenshots" placeholder="Search titles, summaries, tasks, and extracted text…" placeholderTextColor={theme.colors.muted} value={search} onChangeText={setSearch} autoCapitalize="none" style={s.searchInput} />{search !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}><Ionicons name="close-circle-outline" size={20} color={theme.colors.purple} /></Pressable>}</View>
    <View style={s.controls}>
      <View style={s.sortControl}>
        <Pressable accessibilityRole="button" accessibilityLabel={selecting ? 'Leave image selection' : 'Select images to delete'} accessibilityState={{ expanded: selecting }} onPress={() => selecting ? leaveSelection() : setSelecting(true)} style={[s.trash, selecting && s.trashOn]}><Ionicons name="trash-outline" size={18} color={selecting ? '#A33158' : theme.colors.ink} /></Pressable>
        <Text nativeID="gallery-sort-label" style={s.sortLabel}>Filter</Text>
        <Picker accessibilityLabel="Filter" selectedValue={sort} onValueChange={value => setSort(value as GallerySort)} style={s.picker}>{sorts.map(option => <Picker.Item key={option.id} label={option.label} value={option.id} />)}</Picker>
      </View>
      <View accessibilityRole="tablist" accessibilityLabel="Screenshot categories" style={s.chips}>{categories.map(option => <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={`Gallery category: ${option.label}`} accessibilityState={{ selected: category === option.id }} onPress={() => setCategory(option.id)} style={[s.chip, category === option.id && { backgroundColor: option.background, borderColor: option.color }]}><Text style={{ color: category === option.id ? option.color : theme.colors.muted, fontWeight: '600', fontSize: 11 }}>{option.label}</Text></Pressable>)}</View>
    </View>
    {selecting ? <View style={s.selectBar}><Text style={s.subtitle}>{selected.length === 0 ? 'Select images, then delete.' : `${selected.length} selected`}</Text><Pressable accessibilityRole="button" accessibilityLabel="Delete selected images" disabled={selected.length === 0} onPress={() => void deleteSelected()} style={selected.length === 0 ? { opacity: 0.45 } : undefined}><Text style={s.deleteAction}>Delete</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={leaveSelection}><Text style={s.clear}>Cancel</Text></Pressable></View> : null}
    <View style={s.results}><Text accessibilityLiveRegion="polite" style={s.subtitle}>{ready ? `${visible.length} ${visible.length === 1 ? 'screenshot' : 'screenshots'}${category !== 'all' ? ` · ${categories.find(entry => entry.id === category)?.label}` : ''}` : 'Opening your collection…'}</Text>{(search || category !== 'all') && <Pressable accessibilityRole="button" onPress={clear}><Text style={s.clear}>Clear filters</Text></Pressable>}</View>
    {deleteError ? <Text role="alert" style={{ color: '#A33158', fontSize: 13 }}>{deleteError}</Text> : null}

    {!ready ? <ActivityIndicator color={theme.colors.purple} /> : visible.length > 0 ? <View style={s.grid}>{visible.map(entry => <View key={entry.key} style={{ width: width > 0 ? (width - 16 * (columns - 1)) / columns : '100%' }}><GalleryCard entry={entry} selecting={selecting} selected={selected.includes(entry.screenshotId)} onSelect={() => toggleSelected(entry.screenshotId)} /></View>)}</View> : <View style={s.empty}><Ionicons name={entries.length ? 'search-outline' : 'images-outline'} size={38} color={theme.colors.purple} /><Text role="heading" aria-level={2} style={s.emptyTitle}>{entries.length ? 'No screenshots found' : 'Your camera roll starts here'}</Text><Text style={s.subtitle}>{entries.length ? 'Try another search or category.' : 'Upload your first screenshot to give it a home.'}</Text><Pressable accessibilityRole="button" onPress={entries.length ? clear : pickScreenshot} style={s.upload}><Text style={s.uploadText}>{entries.length ? 'Clear filters' : 'Upload a screenshot'}</Text></Pressable></View>}
  </View></AppShell>;
}
const s = StyleSheet.create({ header: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center' }, heading: { fontFamily: 'PixieHeading', fontSize: 33, lineHeight: 43, letterSpacing: 0, fontWeight: '800', color: theme.colors.ink }, subtitle: { color: theme.colors.muted, fontSize: 12, lineHeight: 20 }, upload: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.colors.pink, paddingHorizontal: 19, paddingVertical: 12, borderRadius: 13 }, uploadText: { fontSize: 13, fontWeight: '600', color: theme.colors.ink }, search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderWidth: 1, borderColor: '#DDD3E5', borderRadius: 13, backgroundColor: 'white' }, searchInput: { flex: 1, minWidth: 0, paddingVertical: 14, color: theme.colors.ink, fontSize: 13 }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' }, chips: { flex: 1, minWidth: 260, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, backgroundColor: 'white' }, sortControl: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }, picker: { fontFamily: Platform.select({ web: 'PixieBodySemibold, Trebuchet MS, Arial, sans-serif', default: 'PixieBodySemibold' }), fontSize: 12, color: theme.colors.ink, backgroundColor: 'white', width: 215, maxWidth: '100%', borderWidth: 1, borderColor: '#DDD3E5', borderRadius: 12, padding: 10 }, sortLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.muted, marginRight: 4 }, results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, clear: { fontSize: 12, color: theme.colors.purple, fontWeight: '600' }, trash: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }, trashOn: { borderColor: '#E7A3BE', backgroundColor: '#FFE0EF' }, selectBar: { flexDirection: 'row', alignItems: 'center', gap: 16 }, deleteAction: { fontSize: 12, color: '#A33158', fontWeight: '700' }, note: { fontSize: 10, lineHeight: 17, color: theme.colors.muted, marginTop: -12 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-start' }, empty: { alignItems: 'center', padding: 35, gap: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5C5E8', borderRadius: 22, backgroundColor: '#F7F1FF' }, emptyTitle: { fontFamily: 'PixieHeading', fontSize: 23, fontWeight: '800', color: theme.colors.ink, textAlign: 'center' } });
