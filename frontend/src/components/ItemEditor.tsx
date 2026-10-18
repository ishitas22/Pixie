import { Text, TextInput } from './Typography';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { categories, theme } from '../theme';
import type { EventInfo, ItemDraft } from '../types/api';
import { toApiItem, toItemForm, type ItemFormValues } from '../utils/itemForm';
export function ItemEditor({ initial, savedItem = false, preserveIds = false, onChange, onSave, onSaveWithoutTasks, onCancel }: { initial: ItemDraft; savedItem?: boolean; preserveIds?: boolean; onChange?: (item: ItemDraft) => void; onSave: (item: ItemDraft) => void | Promise<void>; onSaveWithoutTasks?: (item: ItemDraft) => void | Promise<void>; onCancel: () => void }) {
  const [item, setItem] = useState<ItemFormValues>(() => toItemForm(initial));
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saving = useRef(false);
  const parsed = toApiItem(item, savedItem || preserveIds);
  const errors = attempted ? parsed.errors : {};
  function update(patch: Partial<ItemFormValues>) {
    const next = { ...item, ...patch }; setItem(next);
    const converted = toApiItem(next, savedItem);
    // Partially typed/invalid display dates never enter API-shaped shared state.
    if (!Object.keys(converted.dateErrors).length) onChange?.(converted.item);
  }
  function eventField(field: keyof EventInfo, value: string) { update({ event: { date: null, time: null, location: null, registration_url: null, ...item.event, [field]: value || null } }); }
  function relevantErrors(withTasks: boolean) {
    if (withTasks) return parsed.errors;
    return Object.fromEntries(Object.entries(parsed.errors).filter(([key]) => !key.startsWith('task_') && !key.startsWith('due_')));
  }
  async function save(withTasks = true) {
    if (saving.current) return;
    setAttempted(true); setSaveError('');
    if (Object.keys(relevantErrors(withTasks)).length) return;
    saving.current = true;
    try {
      if (withTasks) await onSave(parsed.item);
      else await onSaveWithoutTasks?.({ ...parsed.item, tasks: [] });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Couldn’t save. Please try again.');
    } finally { saving.current = false; }
  }
  return (
      <View style={s.form}>
        {attempted && Object.keys(errors).length > 0 && <Text role="alert" style={s.error}>Please check the highlighted fields below. Nothing has been saved.</Text>}
        <Field label="Title" value={item.title} onChangeText={title => update({ title })} error={errors.title} />
        <Text style={s.label}>Category</Text><View style={s.categories}>{categories.filter(category => category.id !== 'all').map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Category: ${category.label}`} accessibilityState={{ selected: item.category === category.id }} onPress={() => update({ category: category.id as ItemDraft['category'] })} style={[s.category, { backgroundColor: item.category === category.id ? category.background : '#FFFCF8', borderColor: item.category === category.id ? category.color : theme.colors.line }]}><Text style={{ fontSize: 11, fontWeight: '600', color: category.color }}>{category.label}</Text></Pressable>)}</View>{errors.category ? <Text role="alert" style={s.error}>{errors.category}</Text> : null}
        <Field label="Summary" value={item.summary} onChangeText={summary => update({ summary })} multiline />
        <Text style={s.section}>Details <Text style={s.optional}>· optional</Text></Text>
        <View style={s.row}><View style={s.half}><Field label="Date" placeholder="MM/DD/YYYY" value={item.event?.date ?? ''} onChangeText={value => eventField('date', value)} error={errors.date} /></View><View style={s.half}><Field label="Time" placeholder="HH:MM (24-hour)" value={item.event?.time ?? ''} onChangeText={value => eventField('time', value)} error={errors.time} /></View></View>
        <Field label="Location" value={item.event?.location ?? ''} onChangeText={value => eventField('location', value)} />
        <Field label="Registration" placeholder="https://…" value={item.event?.registration_url ?? ''} onChangeText={value => eventField('registration_url', value)} error={errors.registration_url} />
        <Text style={s.section}>Suggested tasks <Text style={s.optional}>· optional</Text></Text>
        {item.tasks.length === 0 && <Text style={s.help}>No suggested tasks. Add one if there’s something you need to do.</Text>}
        {item.tasks.map((task, index) => <View key={index} style={s.task}>{task.kind === 'suggestion' ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.included ? 'Included' : 'Suggested'} task ${index + 1}`} accessibilityState={{ checked: Boolean(task.included) }} onPress={() => update({ tasks: item.tasks.map((entry, taskIndex) => taskIndex === index ? { ...entry, included: !entry.included } : entry) })}><Text style={s.link}>{task.included ? 'Included in your tasks' : 'Suggested · include this task'}</Text></Pressable> : null}<View style={s.taskHeader}><Text style={s.label}>Task {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove task ${index + 1}`} onPress={() => update({ tasks: item.tasks.filter((_, taskIndex) => taskIndex !== index) })}><Text style={s.link}>Remove</Text></Pressable></View><Field label={`Task ${index + 1} title`} value={task.title} error={errors[`task_${index}`]} onChangeText={title => update({ tasks: item.tasks.map((entry, taskIndex) => taskIndex === index ? { ...entry, title } : entry) })} />{savedItem && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Task ${index + 1} completed`} accessibilityState={{ checked: Boolean(task.completed) }} onPress={() => update({ tasks: item.tasks.map((entry, taskIndex) => taskIndex === index ? { ...entry, completed: !entry.completed } : entry) })} style={s.addButton}><Text style={s.link}>{task.completed ? '✓ Completed' : '○ Mark complete'}</Text></Pressable>}<Field label={`Task ${index + 1} deadline`} placeholder="MM/DD/YYYY (optional)" value={task.due_date ?? ''} error={errors[`due_${index}`]} onChangeText={due_date => update({ tasks: item.tasks.map((entry, taskIndex) => taskIndex === index ? { ...entry, due_date: due_date || null } : entry) })} /></View>)}
        <Pressable accessibilityRole="button" onPress={() => update({ tasks: [...item.tasks, { title: '', due_date: null, ...(savedItem ? { completed: false } : {}) }] })} style={s.addButton}><Text style={s.link}>+ Add task</Text></Pressable>
        {saveError ? <Text role="alert" style={s.error}>{saveError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => void save(true)} style={s.save}><Text style={s.saveText}>{savedItem ? 'Save Changes' : 'Confirm & Save'}</Text></Pressable>
        {onSaveWithoutTasks ? <Pressable accessibilityRole="button" onPress={() => void save(false)} style={s.addButton}><Text style={s.link}>Save without tasks</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={onCancel}><Text style={s.cancel}>{savedItem ? 'Cancel' : 'Back without confirming'}</Text></Pressable><Text style={s.footnote}>{savedItem ? 'Changes apply only when you save. Cancel discards your edits.' : 'Valid edits stay in Needs Review until you confirm. Saving does not register you for an event or complete tasks.'}</Text>
      </View>
  );
}
function Field({ label, error, ...props }: { label: string; error?: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) { return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#91869B" {...props} style={[s.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, error && { borderColor: '#B34268' }]} />{error && <Text style={s.error}>{error}</Text>}</View>; }
const s = StyleSheet.create({ intro: { gap: 12, marginBottom: 28 }, chip: { alignSelf: 'flex-start', padding: 9, borderRadius: 9, backgroundColor: '#FFF0BB' }, chipText: { color: '#79551B', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }, heading: { fontFamily: 'PixieHeading', fontSize: 29, fontWeight: '800', color: theme.colors.ink, lineHeight: 38 }, help: { fontSize: 12, lineHeight: 21, color: theme.colors.muted }, form: { flex: 1, width: '100%', minWidth: 0, padding: 22, backgroundColor: 'white', borderWidth: 1, borderColor: theme.colors.line, borderRadius: 22, gap: 16 }, field: { gap: 7 }, label: { fontSize: 12, fontWeight: '600', color: theme.colors.ink }, input: { borderWidth: 1, borderColor: '#DDD3E5', borderRadius: 10, backgroundColor: '#FFFCF8', padding: 12, fontSize: 14, color: theme.colors.ink }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -5 }, category: { padding: 9, borderWidth: 1, borderRadius: 10 }, section: { fontFamily: 'PixieHeading', fontSize: 17, fontWeight: '800', color: theme.colors.ink, marginTop: 8 }, optional: { color: theme.colors.muted, fontSize: 12, fontWeight: '400' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, half: { flex: 1, minWidth: 145 }, task: { padding: 14, borderRadius: 14, backgroundColor: '#F7F1FF', gap: 12 }, taskHeader: { flexDirection: 'row', justifyContent: 'space-between' }, link: { color: theme.colors.purple, fontSize: 12, fontWeight: '600' }, addButton: { padding: 12, borderWidth: 1, borderColor: '#DDD3E5', borderStyle: 'dashed', borderRadius: 10, alignItems: 'center' }, save: { backgroundColor: theme.colors.pink, padding: 16, borderRadius: 13, alignItems: 'center', marginTop: 8 }, saveText: { color: theme.colors.ink, fontSize: 14, fontWeight: '600' }, cancel: { color: theme.colors.purple, fontSize: 12, textAlign: 'center', fontWeight: '600',}, footnote: { color: theme.colors.muted, fontSize: 10, lineHeight: 17, textAlign: 'center' }, error: { color: '#A33158', fontSize: 12, lineHeight: 19 } });
