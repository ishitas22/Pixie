import { Text, Link } from './Typography';

import { Pressable, View } from 'react-native';
import { AppShell } from './AppShell';
import { theme } from '../theme';
export function MilestonePlaceholder({ title, description }: { title: string; description: string }) {
  return <AppShell><View style={{ paddingVertical: 60, gap: 18, maxWidth: 580 }}><Text style={{ color: theme.colors.green, fontSize: 12 }}>✧  COMING IN A FUTURE MILESTONE</Text><Text role="heading" aria-level={1} style={{ fontSize: 34, fontWeight: '600', color: theme.colors.ink }}>{title}</Text><Text style={{ color: theme.colors.muted, fontSize: 16, lineHeight: 26 }}>{description}</Text><Link href="/" asChild><Pressable style={{ alignSelf: 'flex-start', padding: 14, backgroundColor: theme.colors.paleGreen, borderRadius: 12 }}><Text style={{ color: theme.colors.green, fontWeight: '600' }}>← Back to dashboard</Text></Pressable></Link></View></AppShell>;
}
