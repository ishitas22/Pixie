import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { getTaskCalendar, messageOf } from "../api";
import { AppShell } from "../components/AppShell";
import { Link, Text } from "../components/Typography";
import { toContractCategory } from "../services/adapt";
import { usePixie } from "../state/PixieProvider";
import { categories, categoryInfo, theme } from "../theme";
import type { CalendarTask, TaskCalendar } from "../types";
import type { Category } from "../types/api";
import { monthCells, shiftMonth } from "../utils/calendar";
import { localDate } from "../utils/dashboard";
import { formatDate } from "../utils/dates";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function visible(tasks: CalendarTask[], showCompleted: boolean, category: Category | "all"): CalendarTask[] {
  return tasks.filter((task) => (showCompleted || !task.completed) && (category === "all" || toContractCategory(task.category) === category));
}

export default function Calendar() {
  const { ready, revision } = usePixie();
  const width = useWindowDimensions().width;
  const compact = width < 750;
  const [today, setToday] = useState(() => localDate(new Date()));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | "all">("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [data, setData] = useState<TaskCalendar | null>(null);
  const [error, setError] = useState("");
  const days = monthCells(month);

  useEffect(() => {
    const timer = setInterval(() => setToday(localDate(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const dated = monthCells(month).filter((day): day is string => Boolean(day));
    if (!dated.length) {
      return;
    }
    let cancelled = false;
    getTaskCalendar(dated[0], dated[dated.length - 1])
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError("");
          if (next.today) {
            setToday(next.today);
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(messageOf(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month, revision]);

  const datedTasks = visible(data?.tasks ?? [], showCompleted, category);
  const undated = visible(data?.undated ?? [], showCompleted, category);
  const needsDate = visible(data?.needsDateReview ?? [], showCompleted, category);
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  function navigate(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelected(`${next}-01`);
    setExpanded(null);
  }
  function goToday() {
    const current = data?.today || localDate(new Date());
    setToday(current);
    setMonth(current.slice(0, 7));
    setSelected(current);
    setExpanded(null);
  }
  function onDay(date: string): CalendarTask[] {
    return datedTasks.filter((task) => task.deadline === date);
  }

  return (
    <AppShell>
      <View style={s.header}>
        <Text role="heading" aria-level={1} style={s.title}>Calendar <Text style={{ color: theme.colors.pink }}>✦</Text></Text>
        <View style={s.navigation}>
          <Pressable accessibilityRole="button" onPress={() => setShowCompleted((current) => !current)} style={s.todayButton}>
            <Text style={s.buttonText}>{showCompleted ? "Hide completed" : "Show completed"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => navigate(-1)} style={s.arrow}><Ionicons name="chevron-back" size={18} color={theme.colors.purple} /></Pressable>
          <Text role="heading" aria-level={2} accessibilityLiveRegion="polite" style={s.monthTitle}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => navigate(1)} style={s.arrow}><Ionicons name="chevron-forward" size={18} color={theme.colors.purple} /></Pressable>
          <Pressable accessibilityRole="button" onPress={goToday} style={s.todayButton}><Text style={s.buttonText}>Today</Text></Pressable>
        </View>
      </View>
      <View style={s.chips}>{categories.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Calendar category: ${option.label}`} accessibilityState={{ selected: category === option.id }} onPress={() => setCategory(option.id)} style={[s.chip, category === option.id && { backgroundColor: option.background, borderColor: option.color }]}><Text style={{ color: category === option.id ? option.color : theme.colors.muted, fontSize: 11, fontWeight: "600" }}>{option.label}</Text></Pressable>)}</View>
      {!ready && !data ? <ActivityIndicator color={theme.colors.purple} /> : (
        <View style={s.calendar}>
          <View style={s.weekdays}>{weekdays.map((day) => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
          {Array.from({ length: days.length / 7 }, (_, row) => (
            <View key={row} style={s.week}>
              {days.slice(row * 7, row * 7 + 7).map((date, column) => {
                const dayTasks = date ? onDay(date) : [];
                const isToday = date === today;
                const isSelected = date === selected;
                return (
                  <View key={date ?? `blank-${column}`} style={[s.cell, compact && { minHeight: 100, padding: 4 }, !date && { backgroundColor: "#FCFAFD" }, isSelected && s.selectedCell, isToday && s.currentCell, isToday && isSelected && s.selectedToday]}>
                    {date ? (
                      <>
                        <Pressable accessibilityRole="button" accessibilityLabel={`${formatDate(date)}${isToday ? ", today" : ""}, ${dayTasks.length} task deadlines`} accessibilityState={{ selected: isSelected }} onPress={() => setSelected(date)} style={s.daySelect}>
                          <Text style={[s.dayNumber, isToday && s.currentNumber, isSelected && !isToday && s.selectedNumber, isToday && isSelected && { borderColor: theme.colors.yellow, borderWidth: 2 }]}>{Number(date.slice(-2))}</Text>
                        </Pressable>
                        <View style={{ gap: 5 }}>
                          {(expanded === date ? dayTasks : dayTasks.slice(0, 2)).map((task) => <TaskPill key={task.id} task={task} compact={compact} />)}
                          {dayTasks.length > 2 ? (
                            <Pressable accessibilityRole="button" accessibilityLabel={`${expanded === date ? "Show fewer" : "Show all"} tasks on ${formatDate(date)}`} accessibilityState={{ expanded: expanded === date }} onPress={() => { setSelected(date); setExpanded(expanded === date ? null : date); }}>
                              <Text style={s.more}>{expanded === date ? "Show less" : `+${dayTasks.length - 2} more`}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
          <View style={s.legend}>{categories.filter((option) => option.id !== "all").map((option) => <View key={option.id} style={s.legendItem}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: option.color }} /><Text style={s.legendText}>{option.label}</Text></View>)}</View>
        </View>
      )}
      {error ? <Text role="alert" style={s.error}>{error}</Text> : null}
      <Text style={s.note}>{datedTasks.length} approved task {datedTasks.length === 1 ? "deadline" : "deadlines"} in this view. Events stay off this calendar. Select a date to highlight it.</Text>
      {needsDate.length ? (
        <View style={s.later}>
          <Text role="heading" aria-level={2} style={s.laterTitle}>Needs a date</Text>
          <Text style={s.note}>These deadlines need a real date before they can sit on a day.</Text>
          {needsDate.map((task) => <LaterRow key={task.id} task={task} />)}
        </View>
      ) : null}
      <View style={s.later}>
        <Text role="heading" aria-level={2} style={s.laterTitle}>Do later</Text>
        <Text style={s.note}>Approved tasks with no deadline stay here.</Text>
        {undated.length ? undated.map((task) => <LaterRow key={task.id} task={task} />) : <Text style={s.note}>Nothing waiting without a date.</Text>}
      </View>
    </AppShell>
  );
}

function TaskPill({ task, compact }: { task: CalendarTask; compact: boolean }) {
  const category = categoryInfo(toContractCategory(task.category));
  const body = (
    <View style={{ backgroundColor: category.background, borderRadius: 12, paddingHorizontal: compact ? 4 : 9, paddingVertical: 5 }}>
      <Text numberOfLines={compact ? 2 : 1} style={{ fontSize: compact ? 9 : 11, lineHeight: compact ? 13 : 16, fontWeight: "600", color: task.overdue && !task.completed ? "#A33158" : category.color }}>
        {task.completed ? "✓ " : ""}{task.title}
      </Text>
    </View>
  );
  if (!task.itemId) {
    return body;
  }
  return (
    <Link href={{ pathname: "/items/[id]", params: { id: task.itemId } }} asChild>
      <Pressable accessibilityLabel={`Open task: ${task.title}, ${task.deadline ? formatDate(task.deadline) : "no deadline"}`}>{body}</Pressable>
    </Link>
  );
}

function LaterRow({ task }: { task: CalendarTask }) {
  const category = categoryInfo(toContractCategory(task.category));
  const inner = (
    <View style={s.laterRow}>
      <Text style={{ fontSize: 15, lineHeight: 23, fontWeight: "700", color: theme.colors.ink }}>{task.title}</Text>
      <Text style={{ fontSize: 12, color: theme.colors.muted }}>{category.label}{task.sourceTitle ? ` · ${task.sourceTitle}` : ""}</Text>
    </View>
  );
  if (!task.itemId) {
    return inner;
  }
  return <Link href={{ pathname: "/items/[id]", params: { id: task.itemId } }} asChild><Pressable accessibilityRole="button">{inner}</Pressable></Link>;
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: "white" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 },
  title: { fontSize: 33, lineHeight: 44, color: theme.colors.ink },
  navigation: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" },
  todayButton: { backgroundColor: "#F0E9FF", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 6 },
  buttonText: { fontSize: 12, fontWeight: "600", color: theme.colors.purple },
  arrow: { padding: 8, borderRadius: 12, backgroundColor: "#F7F1FF" },
  monthTitle: { fontSize: 18, lineHeight: 26, color: theme.colors.ink, minWidth: 130, textAlign: "center" },
  calendar: { width: "100%", minWidth: 0, borderRadius: 24, overflow: "hidden", backgroundColor: "#FFFEFF", borderWidth: 1, borderColor: "#EEE7F4" },
  weekdays: { flexDirection: "row", backgroundColor: "#FAF6FF", paddingVertical: 14 },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: theme.colors.purple },
  week: { flexDirection: "row", alignItems: "stretch" },
  cell: { flex: 1, minWidth: 0, minHeight: 122, padding: 10, borderTopWidth: 1, borderRightWidth: 1, borderColor: "#F1EDF5", gap: 8 },
  selectedCell: { backgroundColor: "#FFF8E5", borderColor: "#E1D3F2", borderWidth: 1 },
  currentCell: { backgroundColor: "#EDE2FF", borderColor: "#9A7BC5", borderWidth: 1 },
  selectedToday: { borderWidth: 2, borderColor: theme.colors.purple, borderStyle: "dashed" },
  daySelect: { flex: 1, minHeight: 30, alignItems: "flex-start" },
  dayNumber: { fontSize: 12, lineHeight: 26, fontWeight: "600", color: theme.colors.ink, width: 28, height: 28, textAlign: "center", borderRadius: 14 },
  currentNumber: { backgroundColor: theme.colors.purple, color: "white" },
  selectedNumber: { backgroundColor: theme.colors.yellow, color: "#6A4F24" },
  more: { color: theme.colors.purple, fontSize: 10, fontWeight: "600", paddingHorizontal: 3, paddingVertical: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, padding: 16, backgroundColor: "#FDFCFF" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: theme.colors.muted, fontSize: 10 },
  note: { fontSize: 11, lineHeight: 19, color: theme.colors.muted, marginTop: 12 },
  error: { color: "#A33158", fontSize: 13, lineHeight: 20, marginTop: 12 },
  later: { marginTop: 28, gap: 10 },
  laterTitle: { fontFamily: "PixieHeading", fontSize: 25, lineHeight: 34, fontWeight: "800", color: theme.colors.ink },
  laterRow: { gap: 4, padding: 16, borderRadius: 16, backgroundColor: "white", borderWidth: 1, borderColor: theme.colors.line },
});
