import { Text, Link } from '../components/Typography';
import { Ionicons } from '@expo/vector-icons';

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { usePixie } from '../state/PixieProvider';
import { theme } from '../theme';
export default function Upload() {
  const { ready, upload, pickScreenshot, cancelUpload } = usePixie();
  return <AppShell><View style={s.panel}><Ionicons name="images-outline" color={theme.colors.purple} size={46} /><Text role="heading" aria-level={1} style={s.title}>{upload.busy ? 'A little demo magic…' : 'Make room for a new possibility.'}</Text><Text style={s.body}>Choose one PNG or JPEG screenshot, up to 10 MB.</Text><View style={s.notice}><Text style={s.body}>Demo analysis only · No AI or OCR is running. The filename becomes a suggested title; unknown details stay blank for you to fill in. Your image stays in this browser.</Text></View>{upload.error ? <Text role="alert" style={s.error}>{upload.error}</Text> : null}
    {upload.busy ? <><ActivityIndicator color={theme.colors.purple} /><Text accessibilityLiveRegion="polite" style={s.body}>Preparing your screenshot for review…</Text><Pressable accessibilityRole="button" onPress={cancelUpload}><Text style={s.link}>Cancel analysis</Text></Pressable></> : <><Pressable accessibilityRole="button" disabled={!ready} onPress={pickScreenshot} style={s.button}><Text style={s.buttonText}>{ready ? 'Choose a screenshot' : 'Opening your collection…'}</Text></Pressable><Link href="/" style={s.link}>Back to dashboard</Link></>}
  </View></AppShell>;
}
const s = StyleSheet.create({ panel: { maxWidth: 680, width: '100%', alignSelf: 'center', backgroundColor: 'white', padding: 30, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 24, alignItems: 'center', gap: 22, marginVertical: 25 }, title: { fontFamily: 'PixieHeading', fontSize: 28, fontWeight: '700', color: theme.colors.ink, textAlign: 'center' }, body: { fontSize: 13, lineHeight: 22, color: theme.colors.muted, textAlign: 'center' }, notice: { padding: 18, borderRadius: 16, backgroundColor: '#FFF5D4' }, button: { backgroundColor: theme.colors.pink, paddingHorizontal: 24, paddingVertical: 15, borderRadius: 14 }, buttonText: { color: theme.colors.ink, fontWeight: '600' }, link: { color: theme.colors.purple, fontSize: 13, fontWeight: '600',}, error: { color: '#A33158', fontSize: 13, lineHeight: 21 } });
