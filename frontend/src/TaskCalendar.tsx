import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getTaskCalendar, imageUrl, messageOf, setTaskCompleted, updateTask } from "./api";
import { dateParts, monthGrid, MONTH_NAMES, shiftMonth, WEEKDAY_NAMES } from "./calendar";
import type { CalendarTask, Category, TaskCalendar } from "./types";

const MAX_PILLS = 3;
const TIME = /^(?:$|([01]\d|2[0-3]):[0-5]\d)$/;

const colors = {
  paper: "#f3eee4",
  card: "#fffdf8",
  ink: "#1e1a16",
  muted: "#6f675e",
  line: "#e2d8c8",
  green: "#0f6e56",
  greenSoft: "#e5f3ee",
  danger: "#8d3a32",
  dangerSoft: "#f8e8e4",
  notice: "#7a5b20",
  noticeSoft: "#f6edd8",
  white: "#ffffff",
  outside: "#ebe4d6",
};

const categoryTone: Record<Category, string> = {
  "Campus events": "#9a5b12",
  "Career Opportunities": "#0f6e56",
  Extracurriculars: "#1d4e89",
  Personal: "#7c3a6b",
  Other: "#6f675e",
};

function visibleTasks(tasks: CalendarTask[], showCompleted: boolean): CalendarTask[] {
  return showCompleted ? tasks : tasks.filter((task) => !task.completed);
}

function dayNumber(value: string): string {
  return String(Number(value.slice(8, 10)));
}

export function TaskCalendar({
  todayHint,
  refreshToken,
  onTasksChanged,
  onOpenSource,
}: {
  todayHint: string;
  refreshToken: number;
  onTasksChanged: () => void;
  onOpenSource: (screenshotId: string) => void;
}) {
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const [data, setData] = useState<TaskCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (cursor) {
      return;
    }
    const hinted = dateParts(todayHint);
    if (hinted) {
      setCursor({ year: hinted.year, month: hinted.month });
      return;
    }
    let cancelled = false;
    getTaskCalendar("2000-01-01", "2000-01-07")
      .then((next) => {
        const parsed = dateParts(next.today);
        if (!cancelled && parsed) {
          setCursor({ year: parsed.year, month: parsed.month });
        }
      })
      .catch(() => {
        // The month grid appears once the dashboard date or this request succeeds.
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, todayHint]);

  const days = useMemo(() => (cursor ? monthGrid(cursor.year, cursor.month) : []), [cursor]);

  useEffect(() => {
    if (!cursor || days.length === 0) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTaskCalendar(days[0], days[days.length - 1])
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(messageOf(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, days, refreshToken]);

  const shown = useMemo(() => {
    if (!data) {
      return { byDay: new Map<string, CalendarTask[]>(), undated: [], review: [] };
    }
    const byDay = new Map<string, CalendarTask[]>();
    for (const task of visibleTasks(data.tasks, showCompleted)) {
      if (!task.deadline) {
        continue;
      }
      const list = byDay.get(task.deadline) ?? [];
      list.push(task);
      byDay.set(task.deadline, list);
    }
    return {
      byDay,
      undated: visibleTasks(data.undated, showCompleted),
      review: visibleTasks(data.needsDateReview, showCompleted),
    };
  }, [data, showCompleted]);

  const allTasks = data ? [...data.tasks, ...data.undated, ...data.needsDateReview] : [];
  const selected = allTasks.find((task) => task.id === selectedId) ?? null;
  const today = data?.today || todayHint;
  const expandedTasks = expandedDate ? shown.byDay.get(expandedDate) ?? [] : [];

  function goToday() {
    const parsed = dateParts(today);
    if (parsed) {
      setCursor({ year: parsed.year, month: parsed.month });
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.month}>
          {cursor ? `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}` : "Calendar"}
        </Text>
        <View style={styles.controls}>
          <Pressable onPress={() => setShowCompleted((current) => !current)} accessibilityRole="button">
            <Text style={styles.link}>{showCompleted ? "Hide completed" : "Show completed"}</Text>
          </Pressable>
          <Pressable
            onPress={() => cursor && setCursor(shiftMonth(cursor.year, cursor.month, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Pressable onPress={goToday} accessibilityRole="button">
            <Text style={styles.today}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => cursor && setCursor(shiftMonth(cursor.year, cursor.month, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>
        Accepted task deadlines{data ? ` · ${data.today} in ${data.timezone}` : ""}. Completed tasks stay hidden until
        you show them.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.hint}>Loading the calendar…</Text>
        </View>
      ) : null}
      {cursor ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.grid}>
            <View style={styles.week}>
              {WEEKDAY_NAMES.map((name) => (
                <Text key={name} style={styles.weekday}>
                  {name}
                </Text>
              ))}
            </View>
            <View style={styles.cells}>
              {days.map((day) => {
                const tasks = shown.byDay.get(day) ?? [];
                const hidden = Math.max(0, tasks.length - MAX_PILLS);
                const inMonth = Number(day.slice(5, 7)) === cursor.month;
                const isToday = day === today;
                return (
                  <View key={day} style={[styles.day, !inMonth && styles.dayOutside]}>
                    <Text style={[styles.dayNumber, !inMonth && styles.dayMuted, isToday && styles.todayNumber]}>
                      {dayNumber(day)}
                    </Text>
                    {tasks.slice(0, MAX_PILLS).map((task) => (
                      <TaskPill key={task.id} task={task} onPress={() => setSelectedId(task.id)} />
                    ))}
                    {hidden > 0 ? (
                      <Pressable onPress={() => setExpandedDate(expandedDate === day ? null : day)} accessibilityRole="button">
                        <Text style={styles.more}>+{hidden} more</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : null}

      {expandedDate ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{expandedDate}</Text>
          {expandedTasks.map((task) => (
            <TaskPill key={task.id} task={task} onPress={() => setSelectedId(task.id)} wide />
          ))}
        </View>
      ) : null}

      {selected ? (
        <TaskDetail
          task={selected}
          onOpenSource={onOpenSource}
          onSaved={() => onTasksChanged()}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {shown.review.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Needs a date</Text>
          <Text style={styles.hint}>These deadlines need a date before they can appear on a day.</Text>
          {shown.review.map((task) => (
            <TaskPill key={task.id} task={task} onPress={() => setSelectedId(task.id)} wide />
          ))}
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Do later</Text>
        <Text style={styles.hint}>Accepted tasks with no deadline stay here.</Text>
        {shown.undated.length === 0 ? <Text style={styles.hint}>Nothing waiting without a date.</Text> : null}
        {shown.undated.map((task) => (
          <TaskPill key={task.id} task={task} onPress={() => setSelectedId(task.id)} wide />
        ))}
      </View>
    </View>
  );
}

function TaskPill({ task, onPress, wide }: { task: CalendarTask; onPress: () => void; wide?: boolean }) {
  const mark = task.completed ? "✓" : task.overdue ? "●" : "✎";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        wide && styles.pillWide,
        { borderLeftColor: categoryTone[task.category] },
        task.completed && styles.pillDone,
        task.overdue && !task.completed && styles.pillOverdue,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${task.category}${task.deadline ? `, due ${task.deadline}` : ""}`}
    >
      <Text style={[styles.mark, task.completed && styles.markDone, task.overdue && !task.completed && styles.markLate]}>
        {mark}
      </Text>
      <Text style={[styles.pillTitle, task.completed && styles.pillTitleDone]} numberOfLines={wide ? 2 : 1}>
        {task.title}
      </Text>
      {task.dueTime ? <Text style={styles.pillTime}>{task.dueTime}</Text> : null}
    </Pressable>
  );
}

function TaskDetail({
  task,
  onOpenSource,
  onSaved,
  onClose,
}: {
  task: CalendarTask;
  onOpenSource: (screenshotId: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDeadline(task.deadline ?? "");
    setDueTime(task.dueTime ?? "");
    setProblem(null);
  }, [task.id, task.deadline, task.dueTime]);

  async function save() {
    const trimmedDate = deadline.trim();
    const trimmedTime = dueTime.trim();
    if (trimmedDate && !dateParts(trimmedDate)) {
      setProblem("Use YYYY-MM-DD, or leave the date blank to move this to Do later.");
      return;
    }
    if (!TIME.test(trimmedTime)) {
      setProblem("Use HH:MM for a time, or leave it blank.");
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await updateTask(task.id, {
        deadline: trimmedDate || null,
        dueTime: trimmedTime || null,
      });
      onSaved();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    setSaving(true);
    setProblem(null);
    try {
      await setTaskCompleted(task.id, !task.completed);
      onSaved();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.detail}>
      <View style={styles.header}>
        <Text style={styles.panelTitle}>{task.title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={styles.link}>Close</Text>
        </Pressable>
      </View>
      <Text style={[styles.category, { color: categoryTone[task.category] }]}>{task.category}</Text>
      {task.dateNeedsReview && task.deadlineText ? (
        <Text style={styles.reviewNote}>Date needs review: {task.deadlineText}</Text>
      ) : null}
      <View style={styles.detailRow}>
        <Pressable onPress={() => onOpenSource(task.screenshotId)} accessibilityRole="button">
          <Image source={{ uri: imageUrl(task.imageUrl) }} style={styles.thumb} resizeMode="cover" />
        </Pressable>
        <View style={styles.detailCopy}>
          <Text style={styles.hint}>From {task.sourceTitle}</Text>
          {task.details ? <Text style={styles.body}>{task.details}</Text> : null}
          {task.supportingText ? <Text style={styles.body}>“{task.supportingText}”</Text> : null}
        </View>
      </View>
      <Text style={styles.label}>Deadline</Text>
      <TextInput
        value={deadline}
        onChangeText={setDeadline}
        style={styles.input}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        maxLength={10}
      />
      <Text style={styles.label}>Time, if you know it</Text>
      <TextInput
        value={dueTime}
        onChangeText={setDueTime}
        style={styles.input}
        placeholder="HH:MM"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        maxLength={5}
      />
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
      <View style={styles.controls}>
        <Pressable onPress={() => void save()} disabled={saving} accessibilityRole="button">
          <Text style={styles.link}>{saving ? "Saving…" : "Save deadline"}</Text>
        </Pressable>
        <Pressable onPress={() => void toggle()} disabled={saving} accessibilityRole="button">
          <Text style={styles.link}>{task.completed ? "Reopen" : "Mark done"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  month: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 32,
    color: colors.ink,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  arrow: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  today: {
    color: colors.ink,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  link: {
    color: colors.green,
    fontWeight: "700",
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grid: {
    minWidth: 840,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  week: {
    flexDirection: "row",
    backgroundColor: colors.paper,
  },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 8,
  },
  cells: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  day: {
    width: "14.2857%",
    minHeight: 118,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 4,
    gap: 4,
    backgroundColor: colors.card,
  },
  dayOutside: {
    backgroundColor: colors.outside,
  },
  dayNumber: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    alignSelf: "flex-start",
    minWidth: 22,
    textAlign: "center",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dayMuted: {
    color: colors.muted,
  },
  todayNumber: {
    backgroundColor: colors.green,
    color: colors.white,
    borderRadius: 999,
    overflow: "hidden",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
    backgroundColor: "#f7f1e6",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pillWide: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  pillDone: {
    opacity: 0.6,
  },
  pillOverdue: {
    backgroundColor: colors.dangerSoft,
  },
  mark: {
    color: colors.muted,
    fontSize: 12,
    width: 14,
    textAlign: "center",
  },
  markDone: {
    color: colors.green,
    fontWeight: "700",
  },
  markLate: {
    color: colors.danger,
  },
  pillTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  pillTitleDone: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  pillTime: {
    color: colors.muted,
    fontSize: 11,
  },
  more: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "700",
    paddingLeft: 4,
  },
  panel: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  detail: {
    gap: 8,
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: 12,
  },
  category: {
    fontSize: 13,
    fontWeight: "700",
  },
  reviewNote: {
    color: colors.notice,
    backgroundColor: colors.noticeSoft,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
  },
  detailRow: {
    flexDirection: "row",
    gap: 10,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.outside,
  },
  detailCopy: {
    flex: 1,
    gap: 4,
  },
  body: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
