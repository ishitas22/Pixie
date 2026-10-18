import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, useWindowDimensions, View } from "react-native";
import { imageUrl } from "../api";
import { theme } from "../theme";
import type { SimilarImage } from "../types";
import { Text } from "./Typography";

export type SimilarSide = {
  id: string;
  filename: string;
  title: string;
  imageUrl: string;
};

function sideLabel(title: string, filename: string): string {
  const name = title.trim();
  if (!name || name === "Untitled screenshot" || name === filename) {
    return filename;
  }
  return name;
}

function Pane({ side, caption, onDelete }: { side: SimilarSide; caption: string; onDelete: () => void }) {
  const label = sideLabel(side.title, side.filename);
  return (
    <View style={{ flex: 1, minWidth: 180, gap: 10, alignItems: "center" }}>
      <Image
        source={{ uri: imageUrl(side.imageUrl) }}
        style={{ width: "100%", height: 220, backgroundColor: "#F0E9FF", borderRadius: 16 }}
        resizeMode="contain"
        accessibilityLabel={label}
      />
      <Text style={{ fontSize: 15, fontWeight: "700", color: theme.colors.ink, textAlign: "center" }}>{label}</Text>
      {label !== side.filename ? (
        <Text style={{ fontSize: 12, color: theme.colors.muted, textAlign: "center" }}>{side.filename}</Text>
      ) : null}
      <Text style={{ fontSize: 12, color: theme.colors.muted }}>{caption}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete the ${caption.toLowerCase()} image ${side.filename}`}
        onPress={onDelete}
        style={{ backgroundColor: "#FFE0EF", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: "#A33158", fontWeight: "700", fontSize: 13 }}>Delete this one</Text>
      </Pressable>
    </View>
  );
}

export function SimilarityPrompt({
  newer,
  older,
  onChoose,
}: {
  newer: SimilarSide;
  older: SimilarSide;
  onChoose: (choice: "keep" | "delete-new" | "delete-old") => void;
}) {
  const stacked = useWindowDimensions().width < 760;
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(48, 40, 63, 0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 20,
      }}
    >
      <View
        accessibilityViewIsModal
        style={{
          width: "100%",
          maxWidth: 760,
          backgroundColor: "#FFFCF8",
          borderRadius: 24,
          padding: 22,
          gap: 18,
          borderWidth: 1,
          borderColor: "#EEE6F0",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles" size={18} color={theme.colors.pink} />
          <Text role="heading" style={{ flex: 1, fontFamily: "PixieHeading", fontSize: 22, lineHeight: 30, fontWeight: "800", color: theme.colors.ink }}>
            Hmmm...these seem similar. Are these two different images?
          </Text>
        </View>
        <View style={{ flexDirection: stacked ? "column" : "row", gap: 18 }}>
          <Pane side={newer} caption="Just uploaded" onDelete={() => onChoose("delete-new")} />
          <Pane side={older} caption="Already saved" onDelete={() => onChoose("delete-old")} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep both images"
          onPress={() => onChoose("keep")}
          style={{ alignSelf: "center", backgroundColor: theme.colors.pink, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: "700" }}>Keep both</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function similarFrom(match: SimilarImage): SimilarSide {
  return { id: match.id, filename: match.filename, title: match.title, imageUrl: match.imageUrl };
}
