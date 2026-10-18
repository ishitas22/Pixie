import { Text, Link } from "../components/Typography";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { AppShell } from "../components/AppShell";
import { DropSurface } from "../components/DropSurface";
import { usePixie } from "../state/PixieProvider";
import { theme } from "../theme";

if (typeof document !== "undefined" && !document.getElementById("pixie-wait-spin")) {
  const style = document.createElement("style");
  style.id = "pixie-wait-spin";
  style.textContent = "@keyframes pixie-wait-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
  document.head.appendChild(style);
}

const spinnerColors = [
  theme.colors.lavender,
  theme.colors.pink,
  theme.colors.teal,
  theme.colors.yellow,
  theme.colors.purple,
  theme.colors.paleGreen,
];

const stageLines = [
  "Analyzing image",
  "Reading the details",
  "Creating tasks",
  "Almost ready",
];

const spinMotion = {
  animationDuration: "900ms",
  animationIterationCount: "infinite",
  animationTimingFunction: "linear",
  animationKeyframes: "pixie-wait-spin",
} as const;

function batchMark(statusText: string) {
  const match = statusText.match(/\((\d+ of \d+)\)/);
  return match ? ` · ${match[1]}` : "";
}

function PlayfulWait({ statusText }: { statusText: string }) {
  const [colorIndex, setColorIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const colorTimer = setInterval(() => {
      setColorIndex((current) => (current + 1) % spinnerColors.length);
    }, 700);
    const stageTimer = setInterval(() => {
      setStageIndex((current) => (current + 1) % stageLines.length);
    }, 2000);
    return () => {
      clearInterval(colorTimer);
      clearInterval(stageTimer);
    };
  }, []);

  const color = spinnerColors[colorIndex];
  const line = `${stageLines[stageIndex]}${batchMark(statusText)}`;

  return (
    <>
      {Platform.OS === "web" ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[s.spinner, spinMotion as never, { borderTopColor: color, borderRightColor: color }]}
        />
      ) : (
        <ActivityIndicator accessibilityElementsHidden color={color} size="small" />
      )}
      <Text accessibilityLiveRegion="polite" style={s.body}>{line}</Text>
    </>
  );
}

export default function Upload() {
  const { ready, upload, pickScreenshot, ingestFiles, cancelUpload } = usePixie();
  const label = upload.phase === "reading" ? "Reading image" : upload.phase === "analyzing" ? "Analyzing with local AI" : upload.phase === "saving" ? "Saving…" : "Make room for a new possibility.";
  const comparing = upload.statusText.startsWith("Waiting for you");
  const playful = upload.busy && !comparing && (upload.phase === "reading" || upload.phase === "analyzing");
  return (
    <AppShell>
      <DropSurface label="Drop images to upload" disabled={!ready || upload.busy} onFiles={(files) => void ingestFiles(files)} style={s.panel} activeStyle={{ borderColor: theme.colors.lavender, borderWidth: 2 }}>
        <Ionicons name="images-outline" color={theme.colors.purple} size={46} />
        <Text role="heading" aria-level={1} style={s.title}>{upload.busy ? label : "Make room for a new possibility."}</Text>
        <Text style={s.body}>Choose PNG, JPEG, or HEIC screenshots, up to 8 MB each. You can choose more than one. HEIC is converted to JPEG on this computer.</Text>
        <View style={s.notice}>
          <Text style={s.body}>Pixie reads the image, then asks the local model to suggest a title, time, location, and actions. Nothing is saved as finished until you confirm it.</Text>
        </View>
        {upload.error ? <Text role="alert" style={s.error}>{upload.error}</Text> : null}
        {upload.busy ? (
          <>
            {playful ? <PlayfulWait statusText={upload.statusText} /> : (
              <>
                <ActivityIndicator color={theme.colors.purple} />
                <Text accessibilityLiveRegion="polite" style={s.body}>{upload.statusText || label}</Text>
              </>
            )}
            <Pressable accessibilityRole="button" onPress={cancelUpload}><Text style={s.link}>Cancel</Text></Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" disabled={!ready} onPress={pickScreenshot} style={s.button}>
              <Text style={s.buttonText}>{ready ? "Choose screenshots" : "Opening your collection…"}</Text>
            </Pressable>
            <Link href="/" style={s.link}>Back to dashboard</Link>
          </>
        )}
      </DropSurface>
    </AppShell>
  );
}

const s = StyleSheet.create({
  panel: { maxWidth: 680, width: "100%", alignSelf: "center", backgroundColor: "white", padding: 30, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 24, alignItems: "center", gap: 22, marginVertical: 25 },
  title: { fontFamily: "PixieHeading", fontSize: 28, fontWeight: "700", color: theme.colors.ink, textAlign: "center" },
  body: { fontSize: 13, lineHeight: 22, color: theme.colors.muted, textAlign: "center" },
  notice: { padding: 18, borderRadius: 16, backgroundColor: "#FFF5D4" },
  button: { backgroundColor: theme.colors.pink, paddingHorizontal: 24, paddingVertical: 15, borderRadius: 14 },
  buttonText: { color: theme.colors.ink, fontWeight: "600" },
  link: { color: theme.colors.purple, fontSize: 13, fontWeight: "600" },
  error: { color: "#A33158", fontSize: 13, lineHeight: 21, textAlign: "center" },
  spinner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: theme.colors.line,
  },
});
