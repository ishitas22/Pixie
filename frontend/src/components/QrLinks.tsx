import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Typography";
import { theme } from "../theme";
import type { QrCode, TaskInfo } from "../types/api";

export function QrLinks({
  codes,
  note,
  tasks = [],
  onAssign,
}: {
  codes: QrCode[];
  note?: string | null;
  tasks?: TaskInfo[];
  onAssign?: (taskId: string, payload: string, label: string) => void;
}) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const urls = codes.filter((code) => code.readable && code.isUrl && code.payload);
  const texts = codes.filter((code) => code.readable && !code.isUrl && code.payload);
  const choosing = urls.length > 1;
  if (!urls.length && !texts.length && !note) {
    return null;
  }

  async function copy(payload: string) {
    setCopyError("");
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      setCopyError("Copy is not available in this browser.");
      return;
    }
    try {
      await clipboard.writeText(payload);
      setCopied(payload);
    } catch {
      setCopyError("Could not copy that link.");
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Links from this image</Text>
      {note ? <Text role="status" style={s.note}>{note}</Text> : null}
      {texts.map((code) => (
        <Text key={code.id} selectable style={s.text}>{code.payload}</Text>
      ))}
      {urls.map((code) => {
        const attached = tasks.find((task) => task.link_url === code.payload);
        const label = choosing ? "Link from QR code." : attached?.link_label || "Link from QR code.";
        return (
          <View key={code.id} style={s.card}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.domain}>{code.domain || "Link"}</Text>
            <View style={s.row}>
              <Pressable accessibilityRole="link" accessibilityLabel={`Open link ${code.domain || code.payload}`} onPress={() => void Linking.openURL(code.payload)}>
                <Text style={s.action}>Open link</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Copy link ${code.domain || code.payload}`} onPress={() => void copy(code.payload)}>
                <Text style={s.action}>{copied === code.payload ? "Copied" : "Copy link"}</Text>
              </Pressable>
            </View>
            {choosing && onAssign
              ? tasks.filter((task) => task.id).map((task) => (
                  <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`Use ${code.domain || "link"} with ${task.title}`} onPress={() => onAssign(task.id!, code.payload, "Link from QR code.")}>
                    <Text style={s.choose}>{task.link_url === code.payload ? "Chosen for" : "Use with"} {task.title}</Text>
                  </Pressable>
                ))
              : null}
          </View>
        );
      })}
      {copyError ? <Text role="alert" style={s.error}>{copyError}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  heading: { fontSize: 13, fontWeight: "700", color: theme.colors.ink },
  note: { fontSize: 12, lineHeight: 18, color: "#79551B", backgroundColor: "#FFF0BB", borderRadius: 10, padding: 10 },
  text: { fontSize: 13, lineHeight: 20, color: theme.colors.ink },
  card: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: "#F7F1FF", borderWidth: 1, borderColor: "#E4D7FB" },
  label: { fontSize: 11, fontWeight: "700", color: theme.colors.purple },
  domain: { fontSize: 15, fontWeight: "700", color: theme.colors.ink },
  row: { flexDirection: "row", gap: 14 },
  action: { color: theme.colors.purple, fontSize: 12, fontWeight: "700" },
  choose: { color: theme.colors.ink, fontSize: 12, fontWeight: "600" },
  error: { color: "#A33158", fontSize: 12 },
});
