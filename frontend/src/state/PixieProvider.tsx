import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { createContext, useContext, useEffect, useReducer, useRef, useState, type PropsWithChildren } from 'react';
import { Image, Platform } from 'react-native';
import { createMockData } from '../mocks/dashboard';
import { analyzeScreenshot, patchMockItem, patchMockTask, saveMockItem, validateImageMetadata } from '../services/mockApi';
import { loadCollection, persistCollection } from '../services/persistence';
import { normalizeDraft, validateDraft } from '../utils/confirmation';
import type { AnalyzeResponse, ItemDraft } from '../types/api';
import { pixieReducer, type PixieState } from './model';
type Store = { completeTask: (itemId: string, index: number) => void; state: PixieState; ready: boolean; storageWarning: string; upload: { busy: boolean; error: string }; pickScreenshot: () => Promise<void>; cancelUpload: () => void; editDraft: (draft: AnalyzeResponse) => void; confirmDraft: (draft_id: string, item: ItemDraft) => string; updateItem: (id: string, patch: Partial<ItemDraft>) => void };
const Context = createContext<Store | null>(null);
export function PixieProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(pixieReducer, undefined, () => ({ version: 1 as const, ...createMockData(), images: {} }));
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [upload, setUpload] = useState({ busy: false, error: '' });
  const uploadToken = useRef(0);
  const processing = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => { let active = true; loadCollection().then(saved => { if (active && saved) dispatch({ type: 'hydrate', state: saved }); }).catch(() => { if (active) setStorageWarning('Browser storage is unavailable. Your collection will stay in this tab, but may not survive a refresh.'); }).finally(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!ready) return; writes.current = writes.current.then(() => persistCollection(state)).catch(() => { setStorageWarning('Couldn’t save to browser storage. Keep this tab open to retain your screenshots.'); }); }, [state, ready]);
  async function pickScreenshot() {
    if (!ready || processing.current) return;
    // Must be invoked directly by a user press: browsers require an active gesture.
    const token = ++uploadToken.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg'], multiple: false, copyToCacheDirectory: true, base64: true });
      if (token !== uploadToken.current || result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      validateImageMetadata(asset.mimeType, asset.name, asset.size);
      processing.current = true;
      setUpload({ busy: true, error: '' });
      router.push('/upload');
      // Web picker returns a persistent data URI when base64=true. Native keeps its cached URI.
      const uri = Platform.OS === 'web' ? asset.base64 ?? '' : asset.uri;
      if (Platform.OS === 'web') URL.revokeObjectURL(asset.uri);
      if (Platform.OS === 'web' && !/^data:image\/(?:png;base64,iVBORw0KGgo|jpeg;base64,\/9j\/)/i.test(uri)) throw new Error('Couldn’t read this image. Please choose a PNG or JPEG screenshot.');
      await new Promise<void>((resolve, reject) => Image.getSize(uri, () => resolve(), () => reject(new Error('This image could not be decoded. Please choose another PNG or JPEG.'))));
      await new Promise(resolve => setTimeout(resolve, 750));
      if (token !== uploadToken.current) return;
      const draft = analyzeScreenshot(asset.name);
      dispatch({ type: 'draft', draft, image: { uri, name: asset.name, uploaded_at: new Date().toISOString() } });
      setUpload({ busy: false, error: '' });
      router.replace({ pathname: '/confirmation/[id]', params: { id: draft.draft_id } });
    } catch (error) {
      if (token === uploadToken.current) { setUpload({ busy: false, error: error instanceof Error ? error.message : 'Couldn’t open your screenshot. Please try again.' }); router.push('/upload'); }
    } finally { if (token === uploadToken.current) processing.current = false; }
  }
  function cancelUpload() { uploadToken.current++; processing.current = false; setUpload({ busy: false, error: '' }); router.replace('/'); }
  function confirmDraft(draft_id: string, item: ItemDraft) {
    const draft = state.drafts.find(draft => draft.draft_id === draft_id);
    if (!draft) throw new Error('This draft has already been saved or is unavailable.');
    const normalized = normalizeDraft(item);
    if (Object.keys(validateDraft(normalized)).length) throw new Error('Please check the highlighted fields.');
    const saved = saveMockItem({ draft_id, item: normalized });
    dispatch({ type: 'confirm', draft_id, item: saved });
    return saved.id;
  }
  function updateItem(id: string, patch: Partial<ItemDraft>) {
    const existing = state.items.find(item => item.id === id);
    if (!existing) throw new Error('This item is no longer available.');
    const merged = normalizeDraft({ ...existing, ...patch }, true);
    if (Object.keys(validateDraft(merged)).length) throw new Error('Please check the highlighted fields.');
    const item = patchMockItem(existing, merged);
    dispatch({ type: 'updateItem', item });
  }
  function completeTask(itemId: string, index: number) {
    const item = state.items.find(item => item.id === itemId);
    if (!item?.tasks[index]) return;
    dispatch({ type: 'updateItem', item: { ...item, tasks: item.tasks.map((task, taskIndex) => taskIndex === index ? patchMockTask(task, { completed: true }) : task) } });
  }
  return <Context.Provider value={{ completeTask, state, ready, storageWarning: Platform.OS === 'web' ? storageWarning : 'Demo collection is stored for this session on this device.', upload, pickScreenshot, cancelUpload, updateItem, editDraft: draft => dispatch({ type: 'edit', draft }), confirmDraft }}>{children}</Context.Provider>;
}
export function usePixie() { const value = useContext(Context); if (!value) throw new Error('PixieProvider is required.'); return value; }
