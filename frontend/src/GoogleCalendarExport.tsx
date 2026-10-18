import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getGoogleCalendarUrl, messageOf, PixieApiError } from "./api";
import { addDays, dateParts } from "./calendar";
import type { SavedItem } from "./types";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function suggestOneHour(start: string): { time: string; nextDay: boolean } {
  const match = TIME.exec(start.trim());
  if (!match) {
    return { time: "", nextDay: false };
  }
  const total = Number(match[1]) * 60 + Number(match[2]) + 60;
  const nextDay = total >= 24 * 60;
  const wrapped = total % (24 * 60);
  const hours = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const minutes = String(wrapped % 60).padStart(2, "0");
  return { time: `${hours}:${minutes}`, nextDay };
}

function openCalendarForm(url: string): boolean {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(opened);
  }
  void Linking.openURL(url);
  return true;
}

/** An event is decided from saved date, time, or place fields, not from the category name. */
export function isEventItem(item: SavedItem): boolean {
  return Boolean(
    item.eventDate.trim() ||
      item.endDate.trim() ||
      item.startTime.trim() ||
      item.endTime.trim() ||
      item.dateText.trim() ||
      item.location.trim() ||
      item.meetingUrl.trim(),
  );
}

function exportMode(item: SavedItem): "hidden" | "edit" | "needs-end" | "ready" {
  if (item.reviewStatus !== "confirmed" || !isEventItem(item)) {
    return "hidden";
  }
  const hasDate = dateParts(item.eventDate.trim()) !== null;
  const hasStart = TIME.test(item.startTime.trim());
  const hasPlace = Boolean(item.location.trim() || item.meetingUrl.trim());
  if (!hasDate || !hasStart || !hasPlace) {
    return "edit";
  }
  if (!TIME.test(item.endTime.trim())) {
    return "needs-end";
  }
  return "ready";
}

export function GoogleCalendarExport({
  item,
  disabled,
  onEdit,
}: {
  item: SavedItem;
  disabled?: boolean;
  onEdit?: () => void;
}) {
  const mode = exportMode(item);
  const suggestion = useMemo(() => suggestOneHour(item.startTime), [item.startTime]);
  const suggestedDate = suggestion.nextDay ? addDays(item.eventDate, 1) : item.eventDate;
  const [endTime, setEndTime] = useState(suggestion.time);
  const [endDate, setEndDate] = useState(item.endDate || suggestedDate);
  const [showEdit, setShowEdit] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setEndTime(suggestion.time);
    setEndDate(item.endDate || suggestedDate);
  }, [item.id, item.startTime, item.endDate, item.eventDate, suggestion.time, suggestedDate]);

  if (mode === "hidden") {
    return null;
  }

  async function openLink() {
    if (disabled || opening) {
      return;
    }
    setNote(null);
    if (mode === "needs-end") {
      if (!TIME.test(endTime.trim()) || dateParts(endDate.trim()) === null) {
        setNote("Enter an end date and an end time as YYYY-MM-DD and HH:MM.");
        return;
      }
    }
    setOpening(true);
    try {
      const url =
        mode === "needs-end"
          ? await getGoogleCalendarUrl(item.id, endTime.trim(), endDate.trim())
          : await getGoogleCalendarUrl(item.id);
      const opened = openCalendarForm(url);
      if (!opened) {
        setNote("The browser blocked the new tab. Allow pop-ups, then try again.");
      }
    } catch (error) {
      if (error instanceof PixieApiError && error.code === "needs_end_time") {
        setNote("Confirm an end time in the form below. The suggested hour is only a suggestion.");
        return;
      }
      setNote(messageOf(error));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.box}>
      {mode === "edit" ? (
        <Pressable
          onPress={() => {
            setShowEdit(true);
            onEdit?.();
          }}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text style={styles.link}>Edit details</Text>
        </Pressable>
      ) : null}
      {mode === "edit" && showEdit ? (
        <Text style={styles.hint}>
          {item.dateText && !item.eventDate
            ? `The screenshot says “${item.dateText}”. Enter a real date, a start time, and a location or meeting link, then save.`
            : "Add a date, a start time, and a location or meeting link, then save."}
        </Text>
      ) : null}
      {mode === "needs-end" ? (
        <View style={styles.form}>
          <Text style={styles.suggestion}>
            Suggested duration: 1 hour. Pixie did not read this time from the screenshot.
          </Text>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            style={styles.input}
            placeholder="End date YYYY-MM-DD"
            placeholderTextColor="#6f675e"
            autoCapitalize="none"
            maxLength={10}
          />
          <TextInput
            value={endTime}
            onChangeText={setEndTime}
            style={styles.input}
            placeholder="End time HH:MM"
            placeholderTextColor="#6f675e"
            autoCapitalize="none"
            maxLength={5}
          />
        </View>
      ) : null}
      {mode === "ready" || mode === "needs-end" ? (
        <Pressable
          onPress={() => void openLink()}
          disabled={disabled || opening}
          accessibilityRole="button"
          accessibilityLabel="Add to Google Calendar"
          style={({ pressed }) => [styles.button, (pressed || disabled || opening) && styles.pressed]}
        >
          <Text style={styles.buttonLabel}>{opening ? "Opening…" : "Add to Google Calendar"}</Text>
        </Pressable>
      ) : null}
      {mode !== "edit" ? (
        <Text style={styles.hint}>Opens Google Calendar for you to review and save.</Text>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 6,
    maxWidth: 360,
  },
  form: {
    gap: 8,
  },
  suggestion: {
    color: "#7a5b20",
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    color: "#6f675e",
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    color: "#8d3a32",
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    color: "#69509A",
    fontWeight: "700",
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#FF80BD",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonLabel: {
    color: "#30283F",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.82,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2d8c8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#1e1a16",
    backgroundColor: "#ffffff",
  },
});
