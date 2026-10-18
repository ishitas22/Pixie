import type { AnalyzeResponse, SavedItem } from '../types/api.ts';
export type LocalImage = { uri: string; name: string; uploaded_at?: string };
export type PixieState = { version: 1; items: SavedItem[]; drafts: AnalyzeResponse[]; images: Record<string, LocalImage> };
export type PixieAction =
  | { type: 'updateItem'; item: SavedItem }
  | { type: 'hydrate'; state: PixieState }
  | { type: 'draft'; draft: AnalyzeResponse; image: LocalImage }
  | { type: 'edit'; draft: AnalyzeResponse }
  | { type: 'confirm'; draft_id: string; item: SavedItem };
export function pixieReducer(state: PixieState, action: PixieAction): PixieState {
  switch (action.type) {
    case 'updateItem': return { ...state, items: state.items.map(item => item.id === action.item.id ? action.item : item) };
    case 'hydrate': return action.state;
    case 'draft': return { ...state, drafts: [action.draft, ...state.drafts], images: { ...state.images, [action.draft.image_url]: action.image } };
    case 'edit': return { ...state, drafts: state.drafts.map(draft => draft.draft_id === action.draft.draft_id ? action.draft : draft) };
    case 'confirm': {
      const draft = state.drafts.find(draft => draft.draft_id === action.draft_id);
      if (!draft) return state; // Back/repeat clicks cannot save a draft twice.
      const image = state.images[draft.image_url];
      const images = { ...state.images };
      delete images[draft.image_url];
      if (image) images[action.item.image_url] = image;
      return { ...state, items: [action.item, ...state.items], drafts: state.drafts.filter(draft => draft.draft_id !== action.draft_id), images };
    }
  }
}
