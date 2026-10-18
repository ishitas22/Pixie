import { Text, Link } from './Typography';
import { Ionicons } from '@expo/vector-icons';

import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { categoryInfo, theme } from '../theme';
import { formatDate } from '../utils/dates';
import type { GalleryEntry } from '../utils/gallery';
export function GalleryCard({ entry }: { entry: GalleryEntry }) {
  const [failed, setFailed] = useState(false);
  const category = categoryInfo(entry.item.category);
  const date = entry.item.event?.date;
  return <Link href={{ pathname: entry.route, params: { id: entry.id } }} asChild><Pressable accessibilityLabel={`${entry.item.title || 'Untitled screenshot'}${entry.needsReview ? ', Needs Review' : ''}`} style={s.card}>
    <View style={[s.thumbnail, { backgroundColor: category.background }]}>{entry.image && !failed ? <Image source={{ uri: entry.image.uri }} accessibilityLabel={`Screenshot: ${entry.item.title}`} resizeMode="contain" style={s.image} onError={() => setFailed(true)} /> : <View style={s.placeholder}><Ionicons name={failed ? 'image-outline' : category.icon} size={40} color={category.color} /><Text style={[s.placeholderTitle, { color: category.color }]}>{failed ? 'Preview unavailable' : entry.item.title}</Text><Text style={s.small}>{entry.image ? 'Open item to inspect image' : 'Demo sample · no original image'}</Text></View>}
      {entry.needsReview && <View style={s.review}><Text style={s.reviewText}>✦ Needs Review</Text></View>}
    </View>
    <View style={s.info}><View style={[s.badge, { backgroundColor: category.background }]}><Text style={{ color: category.color, fontSize: 10, fontWeight: '600' }}>{category.label}</Text></View><Text numberOfLines={2} style={s.title}>{entry.item.title || 'Untitled screenshot'}</Text><View style={s.date}><Ionicons name="calendar-outline" size={13} color={theme.colors.muted} /><Text style={s.small}>{date ? formatDate(date) : 'No event date'}</Text><Ionicons name="arrow-forward" size={15} color={theme.colors.purple} style={{ marginLeft: 'auto' }} /></View></View>
  </Pressable></Link>;
}
const s = StyleSheet.create({ card: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 19, overflow: 'hidden', backgroundColor: 'white', height: '100%' }, thumbnail: { height: 220, position: 'relative', padding: 12 }, image: { width: '100%', height: '100%', borderRadius: 9 }, placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, placeholderTitle: {  fontSize: 19, textAlign: 'center', fontWeight: '700' }, small: { fontSize: 11, color: theme.colors.muted, lineHeight: 17 }, review: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: theme.colors.yellow, borderRadius: 9 }, reviewText: { fontSize: 10, color: '#705019', fontWeight: '600' }, info: { padding: 16, gap: 12, flex: 1 }, badge: { padding: 6, borderRadius: 7, alignSelf: 'flex-start' }, title: {  fontSize: 16, lineHeight: 23, fontWeight: '700', color: theme.colors.ink, minHeight: 46 }, date: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' } });
