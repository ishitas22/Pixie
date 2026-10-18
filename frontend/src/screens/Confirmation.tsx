import { Text, Link } from '../components/Typography';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { ItemEditor } from '../components/ItemEditor';
import { ScreenshotPreview } from '../components/ScreenshotPreview';
import { usePixie } from '../state/PixieProvider';
import { theme } from '../theme';
export default function Confirmation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, ready, editDraft, confirmDraft } = usePixie();
  const wide = useWindowDimensions().width >= 1100;
  const draft = state.drafts.find(draft => draft.draft_id === id);
  if (!ready) return <AppShell><ActivityIndicator accessibilityLabel="Loading draft" color={theme.colors.purple} /></AppShell>;
  if (!draft) return <AppShell><Text style={s.heading}>This draft is no longer waiting.</Text><Link href="/" style={s.link}>Back to dashboard</Link></AppShell>;
  return <AppShell><View style={s.intro}><Text style={s.chip}>✦ DEMO ANALYSIS · REVIEW BEFORE SAVING</Text><Text role="heading" aria-level={1} style={s.heading}>A little review. Then it’s yours.</Text><Text style={s.help}>Suggestions are demo data, not extracted facts. Unknown details are blank. Dates use MM/DD/YYYY.</Text></View><View style={{ flexDirection: wide ? 'row' : 'column', gap: 28, alignItems: 'flex-start' }}><View style={{ width: wide ? '43%' : '100%' }}><ScreenshotPreview image={state.images[draft.image_url]} /></View><ItemEditor key={id} initial={draft.item} onChange={item => editDraft({ ...draft, item })} onCancel={() => router.replace('/')} onSave={item => { const saved = confirmDraft(id, item); router.replace({ pathname: '/', params: { category: 'all', saved } }); }} /></View></AppShell>;
}
const s = StyleSheet.create({ intro: { gap: 12, marginBottom: 28 }, chip: { alignSelf: 'flex-start', padding: 9, borderRadius: 9, backgroundColor: '#FFF0BB', color: '#79551B', fontSize: 10, fontWeight: '700' }, heading: { fontFamily: 'PixieHeading', fontSize: 29, fontWeight: '800', color: theme.colors.ink, lineHeight: 38 }, help: { fontSize: 12, lineHeight: 21, color: theme.colors.muted }, link: { color: theme.colors.purple, fontSize: 12, fontWeight: '600',} });
