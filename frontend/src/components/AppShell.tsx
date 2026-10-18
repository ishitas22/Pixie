import { BrandLogo } from './BrandLogo';
import { Text, Link } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Category } from '../types/api';
import { usePixie } from '../state/PixieProvider';
import { categories, theme } from '../theme';
export function AppShell({ children, selected = 'all', onCategory, counts = {} }: PropsWithChildren<{ selected?: Category | 'all'; onCategory?: (category: Category | 'all') => void; counts?: Partial<Record<Category | 'all', number>> }>) {
  const { pickScreenshot, ready, upload, storageWarning } = usePixie();
  const wide = useWindowDimensions().width >= 900;
  const [collapsed, setCollapsed] = useState(false);
  const iconsOnly = wide && collapsed;
  return <View style={s.root}>
    <View style={[s.header, !wide && { paddingHorizontal: 16, gap: 12 }]}>
      <Link href="/" asChild><Pressable accessibilityLabel="Pixie home" style={s.brand}><BrandLogo /><Text style={s.brandName}>Pixie<Text style={{ color: theme.colors.pink }}>.</Text></Text></Pressable></Link>
      
      <View style={s.actions}>
        <HeaderAction href="/calendar" label="Calendar" icon="calendar-outline" />
        <HeaderAction href="/camera-roll" label="Camera Roll" icon="images-outline" />
        <Pressable accessibilityRole="button" accessibilityLabel="Upload screenshot" disabled={!ready || upload.busy} onPress={pickScreenshot} style={StyleSheet.flatten([s.action, { backgroundColor: theme.colors.purple, opacity: !ready || upload.busy ? 0.5 : 1 }])}><Ionicons name="add" size={21} color="white" /></Pressable>
      </View>
    </View>
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      <View style={[s.sidebar, iconsOnly && { width: 76, paddingHorizontal: 12 }, !wide && s.mobileSidebar]}>
        {wide && <View style={s.sidebarHeader}>{!collapsed && <Text style={s.eyebrow}>COLLECTION</Text>}<Pressable accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} accessibilityState={{ expanded: !collapsed }} onPress={() => setCollapsed(value => !value)} style={s.toggle}><Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={17} color={theme.colors.ink} /></Pressable></View>}
        <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={false} contentContainerStyle={wide ? { gap: 8 } : { gap: 6, padding: 12 }}>
          {categories.map(category => <Pressable key={category.id} accessibilityLabel={category.label} accessibilityHint={`Filter by ${category.label}`} accessibilityRole="button" accessibilityState={{ selected: selected === category.id }} onPress={() => onCategory ? onCategory(category.id) : router.push({ pathname: '/', params: { category: category.id } })} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [s.category, iconsOnly && { justifyContent: 'center', paddingHorizontal: 0 }, !wide && { paddingVertical: 10 }, selected === category.id && s.selected, hovered && { backgroundColor: '#F7F1FF' }]}>
            <Ionicons name={category.icon} size={19} color={selected === category.id ? theme.colors.green : theme.colors.muted} />{!iconsOnly && <Text style={[s.categoryText, selected === category.id && { color: theme.colors.green, fontWeight: '600' }]}>{category.label}</Text>}{wide && !iconsOnly && counts[category.id] !== undefined && <Text style={s.count}>{counts[category.id] ?? 0}</Text>}
          </Pressable>)}
        </ScrollView>

      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.content, !wide && { padding: 20 }]}>{storageWarning ? <Text role="status" style={{ padding: 12, marginBottom: 16, backgroundColor: '#FFF0BB', color: '#79551B', borderRadius: 10, fontSize: 12 }}>{storageWarning}</Text> : null}{children}</ScrollView>
    </View>
  </View>;
}
function HeaderAction({ href, label, icon, filled = false }: { href: '/calendar' | '/camera-roll' | '/upload'; label: string; icon: 'calendar-outline' | 'images-outline' | 'add'; filled?: boolean }) {
  return <Link href={href} asChild><Pressable accessibilityLabel={label} accessibilityRole="button" style={StyleSheet.flatten([s.action, filled && { backgroundColor: theme.colors.green, borderColor: theme.colors.green }])}><Ionicons name={icon} size={21} color={filled ? 'white' : theme.colors.ink} /></Pressable></Link>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background }, header: { height: 64, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.colors.line, gap: 24, backgroundColor: '#FFFCF8' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 31, height: 31, backgroundColor: theme.colors.green, borderRadius: 14, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] }, brandName: { fontFamily: 'PixieWordmark', fontSize: 29, fontWeight: '700', letterSpacing: 0.5, color: theme.colors.ink }, actions: { marginLeft: 'auto', flexDirection: 'row', gap: 10 }, action: { width: 36, height: 36, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: 'white', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, toggle: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F0E9FF', alignItems: 'center', justifyContent: 'center' }, sidebar: { width: 240, padding: 16, paddingTop: 22, borderRightWidth: 1, borderColor: theme.colors.line }, mobileSidebar: { width: '100%', padding: 0, borderRightWidth: 0, borderBottomWidth: 1 }, eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: '600', color: theme.colors.muted, marginLeft: 12 }, category: { paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12 }, selected: { backgroundColor: theme.colors.paleGreen }, categoryText: { fontWeight: '600', fontSize: 12, lineHeight: 18, color: theme.colors.muted }, count: { marginLeft: 'auto', color: theme.colors.muted, fontSize: 11 }, content: { padding: 28, paddingBottom: 60, width: '100%', maxWidth: 1450, alignSelf: 'center' },
});
