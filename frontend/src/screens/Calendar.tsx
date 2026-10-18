import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Link, Text } from '../components/Typography';
import { usePixie } from '../state/PixieProvider';
import { categories, categoryInfo, theme } from '../theme';
import type { Category } from '../types/api';
import { calendarEvents, eventsOnDate, monthCells, shiftMonth } from '../utils/calendar';
import { displayTime, localDate } from '../utils/dashboard';
import { formatDate } from '../utils/dates';
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function Calendar() {
  const { state, ready } = usePixie();
  const width = useWindowDimensions().width;
  const compact = width < 750;
  const [today, setToday] = useState(() => localDate(new Date()));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | 'all'>('all');
  useEffect(() => { const timer = setInterval(() => setToday(localDate(new Date())), 30000); return () => clearInterval(timer); }, []);
  const events = calendarEvents(state.items, category);
  const days = monthCells(month);
  const monthly = events.filter(item => item.event!.date!.startsWith(month));
  const counts = Object.fromEntries(categories.map(category => [category.id, calendarEvents(state.items, category.id).length]));
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  function navigate(offset: number) { const next = shiftMonth(month, offset); setMonth(next); setSelected(`${next}-01`); setExpanded(null); }
  function goToday() { const current = localDate(new Date()); setToday(current); setMonth(current.slice(0, 7)); setSelected(current); setExpanded(null); }
  return <AppShell selected={category} onCategory={setCategory} counts={counts}>
    <View style={s.header}><Text role="heading" aria-level={1} style={s.title}>Calendar <Text style={{ color: theme.colors.pink }}>✦</Text></Text><View style={s.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => navigate(-1)} style={s.arrow}><Ionicons name="chevron-back" size={18} color={theme.colors.purple} /></Pressable><Text role="heading" aria-level={2} accessibilityLiveRegion="polite" style={s.monthTitle}>{monthLabel}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => navigate(1)} style={s.arrow}><Ionicons name="chevron-forward" size={18} color={theme.colors.purple} /></Pressable><Pressable accessibilityRole="button" onPress={goToday} style={s.todayButton}><Text style={s.buttonText}>Today</Text></Pressable></View></View>
    {!ready ? <ActivityIndicator color={theme.colors.purple} /> :
      <View style={s.calendar}><View style={s.weekdays}>{weekdays.map(day => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
        {Array.from({ length: days.length / 7 }, (_, row) => <View key={row} style={s.week}>{days.slice(row * 7, row * 7 + 7).map((date, column) => {
          const dayEvents = date ? eventsOnDate(events, date) : [];
          const isToday = date === today, isSelected = date === selected;
          return <View key={date ?? `blank-${column}`} style={[s.cell, compact && { minHeight: 100, padding: 4 }, !date && { backgroundColor: '#FCFAFD' }, isSelected && s.selectedCell, isToday && s.currentCell, isToday && isSelected && s.selectedToday]}>{date && <>
            <Pressable accessibilityRole="button" accessibilityLabel={`${formatDate(date)}${isToday ? ', today' : ''}, ${dayEvents.length} events`} accessibilityState={{ selected: isSelected }} onPress={() => setSelected(date)} style={s.daySelect}><Text style={[s.dayNumber, isToday && s.currentNumber, isSelected && !isToday && s.selectedNumber, isToday && isSelected && { borderColor: theme.colors.yellow, borderWidth: 2 }]}>{Number(date.slice(-2))}</Text></Pressable>
            <View style={{ gap: 5 }}>{(expanded === date ? dayEvents : dayEvents.slice(0, 2)).map(item => { const category = categoryInfo(item.category); return <Link key={item.id} href={{ pathname: '/items/[id]', params: { id: item.id } }} asChild><Pressable accessibilityLabel={`Open event: ${item.title}, ${formatDate(date)}, ${item.event?.time ? displayTime(item.event.time) : 'time unspecified'}`} style={{ backgroundColor: category.background, borderRadius: 12, paddingHorizontal: compact ? 4 : 9, paddingVertical: 5 }}><Text numberOfLines={compact ? 2 : 1} style={{ fontSize: compact ? 9 : 11, lineHeight: compact ? 13 : 16, fontWeight: '600', color: category.color }}>{item.title}</Text></Pressable></Link>; })}{dayEvents.length > 2 && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded === date ? 'Show fewer' : 'Show all'} events on ${formatDate(date)}`} accessibilityState={{ expanded: expanded === date }} onPress={() => { setSelected(date); setExpanded(expanded === date ? null : date); }}><Text style={s.more}>{expanded === date ? 'Show less' : `+${dayEvents.length - 2} more`}</Text></Pressable>}</View>
          </>}</View>;

        })}</View>)}
        <View style={s.legend}>{categories.filter(category => category.id !== 'all').map(category => <View key={category.id} style={s.legendItem}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: category.color }} /><Text style={s.legendText}>{category.label}</Text></View>)}</View>
      </View>
    }
    <Text style={s.note}>{monthly.length} confirmed {monthly.length === 1 ? 'event' : 'events'} · Select a date to highlight it. Open an event to view details.</Text>
  </AppShell>;
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 20 },
  title: { fontSize: 33, lineHeight: 44, color: theme.colors.ink },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' },
  todayButton: { backgroundColor: '#F0E9FF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 6 },
  buttonText: { fontSize: 12, fontWeight: '600', color: theme.colors.purple },
  arrow: { padding: 8, borderRadius: 12, backgroundColor: '#F7F1FF' },
  monthTitle: { fontSize: 18, lineHeight: 26, color: theme.colors.ink, minWidth: 130, textAlign: 'center' },
  calendar: { width: '100%', minWidth: 0, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFFEFF', borderWidth: 1, borderColor: '#EEE7F4' },
  weekdays: { flexDirection: 'row', backgroundColor: '#FAF6FF', paddingVertical: 14 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: theme.colors.purple },
  week: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1, minWidth: 0, minHeight: 122, padding: 10, borderTopWidth: 1, borderRightWidth: 1, borderColor: '#F1EDF5', gap: 8 },
  selectedCell: { backgroundColor: '#FFF8E5', borderColor: '#E1D3F2', borderWidth: 1 },
  currentCell: { backgroundColor: '#EDE2FF', borderColor: '#9A7BC5', borderWidth: 1 },
  selectedToday: { borderWidth: 2, borderColor: theme.colors.purple, borderStyle: 'dashed' },
  daySelect: { flex: 1, minHeight: 30, alignItems: 'flex-start' },
  dayNumber: { fontSize: 12, lineHeight: 26, fontWeight: '600', color: theme.colors.ink, width: 28, height: 28, textAlign: 'center', borderRadius: 14 },
  currentNumber: { backgroundColor: theme.colors.purple, color: 'white' },
  selectedNumber: { backgroundColor: theme.colors.yellow, color: '#6A4F24' },
  more: { color: theme.colors.purple, fontSize: 10, fontWeight: '600', paddingHorizontal: 3, paddingVertical: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 16, backgroundColor: '#FDFCFF' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { color: theme.colors.muted, fontSize: 10 },
  note: { fontSize: 11, lineHeight: 19, color: theme.colors.muted, marginTop: 12 },
});
