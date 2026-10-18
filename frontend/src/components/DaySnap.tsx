import { Pressable, StyleSheet, View } from "react-native";
import { Link, Text } from "./Typography";
import { theme } from "../theme";
import { daySnap } from "../utils/dashboard";
import type { Category, SavedItem } from "../types/api";

export function DaySnap({ items, today, category }: { items: SavedItem[]; today: string; category: Category | "all" }) {
  const snap = daySnap(items, today, category);
  const countLabel = `${snap.count} ${snap.count === 1 ? "thing" : "things"} on your radar today`;
  return (
    <View accessibilityLabel="Your day in a snap" style={s.card}>
      <Text style={s.kicker}>YOUR DAY IN A SNAP</Text>
      <Text role="heading" aria-level={3} style={s.count}>{countLabel}</Text>
      {snap.lines.map((line) => (
        <View key={line.key} style={s.line}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>{line.kind === "event" && line.detail ? `${line.title} at ${line.detail}` : line.title}</Text>
            {line.kind === "task" ? <Text style={s.detail}>{line.detail}</Text> : null}
          </View>
          <Link href={{ pathname: "/items/[id]", params: { id: line.itemId } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={line.kind === "task" ? `Open task: ${line.title}` : `View details: ${line.title}`}>
              <Text style={s.action}>{line.kind === "task" ? "Open task" : "View details"}</Text>
            </Pressable>
          </Link>
        </View>
      ))}
      {snap.later ? (
        <View style={s.later}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.kicker}>ONE THING FOR LATER</Text>
            <Text style={s.title}>{snap.later.title}</Text>
          </View>
          <Link href={{ pathname: "/items/[id]", params: { id: snap.later.itemId } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open task: ${snap.later.title}`}>
              <Text style={s.action}>Open task</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#F7F1FF", borderWidth: 1, borderColor: "#E4D7FB", borderRadius: 22, padding: 16, gap: 12, marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700", color: theme.colors.purple },
  count: { fontFamily: "PixieHeading", fontSize: 20, lineHeight: 28, color: theme.colors.ink },
  line: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderRadius: 14, padding: 12 },
  later: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF0BB", borderRadius: 14, padding: 12 },
  title: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: theme.colors.ink },
  detail: { fontSize: 12, color: theme.colors.muted },
  action: { color: theme.colors.purple, fontSize: 12, fontWeight: "700" },
});
