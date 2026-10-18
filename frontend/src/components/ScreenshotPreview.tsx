import { Text } from './Typography';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import type { LocalImage } from '../state/model';
import { theme } from '../theme';

export function ScreenshotPreview({ image, summary }: { image?: LocalImage; summary?: string }) {
  const [enlarged, setEnlarged] = useState(false);
  const [failed, setFailed] = useState(false);
  const summaryText = summary?.trim() ?? '';
  return (
    <View style={s.panel}>
      <Text style={s.label}>YOUR SCREENSHOT</Text>
      {image && !failed ? (
        <Image source={{ uri: image.uri }} accessibilityLabel={`Uploaded screenshot: ${image.name}`} resizeMode="contain" style={s.image} onError={() => setFailed(true)} />
      ) : (
        <View style={s.empty}><Text style={s.name}>{failed ? 'This image couldn’t be displayed. Please try uploading it again.' : 'This sample draft has no uploaded image. Your own uploads will appear here.'}</Text></View>
      )}
      {summary !== undefined ? (
        <View style={s.summary}>
          <Text style={s.summaryLabel}>Summary</Text>
          <Text selectable style={summaryText ? s.summaryBody : s.summaryEmpty}>{summaryText || 'No summary for this image.'}</Text>
        </View>
      ) : null}
      {image && !failed ? (
        <>
          <Text style={s.name}>{image.name}</Text>
          <Pressable accessibilityRole="button" onPress={() => setEnlarged(true)}><Text style={s.link}>Enlarge screenshot ↗</Text></Pressable>
          <Modal visible={enlarged} onRequestClose={() => setEnlarged(false)} animationType="fade">
            <View style={{ flex: 1, padding: 20, gap: 16, backgroundColor: '#FFFCF8' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close enlarged screenshot" onPress={() => setEnlarged(false)} style={{ alignSelf: 'flex-end', padding: 12, borderRadius: 12, backgroundColor: theme.colors.lavender }}><Text style={s.link}>Close ×</Text></Pressable>
              <Image source={{ uri: image.uri }} accessibilityLabel={`Original screenshot: ${image.name}`} resizeMode="contain" style={{ flex: 1, width: '100%' }} />
            </View>
          </Modal>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#F0E9FF', padding: 18, borderRadius: 22, gap: 14 },
  label: { fontSize: 10, fontWeight: '600', color: theme.colors.purple, letterSpacing: 1.5 },
  image: { width: '100%', height: 520, backgroundColor: 'white', borderRadius: 12 },
  name: { fontSize: 12, color: theme.colors.muted, lineHeight: 19 },
  link: { fontSize: 12, color: theme.colors.purple, fontWeight: '600' },
  empty: { minHeight: 260, justifyContent: 'center', padding: 20 },
  summary: { backgroundColor: 'white', borderRadius: 12, padding: 14, gap: 6 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.purple, letterSpacing: 1.5 },
  summaryBody: { fontSize: 14, lineHeight: 22, color: theme.colors.ink },
  summaryEmpty: { fontSize: 13, lineHeight: 21, color: theme.colors.muted },
});
