import type { AnalyzeResponse, Category, ItemDraft, SavedItem } from '../types/api.ts';
import type { LocalImage } from '../state/model.ts';

const COLLECTION_IDS = ['all', 'campus_events', 'career', 'extracurriculars', 'personal', 'other'] as const;
export type GallerySort = 'event' | 'newest' | 'oldest';
export type GalleryEntry = { key: string; id: string; screenshotId: string; item: ItemDraft; image_url: string; image?: LocalImage; needsReview: boolean; created_at: string | null; extracted_text: string; route: '/items/[id]' | '/confirmation/[id]' };
export function galleryEntries(items: SavedItem[], drafts: AnalyzeResponse[], images: Record<string, LocalImage>): GalleryEntry[] {
  return [
    ...items.map(item => ({ key: `item-${item.id}`, id: item.id, screenshotId: item.screenshot_id || item.id, item, image_url: item.image_url, image: images[item.image_url], needsReview: !item.confirmed, created_at: images[item.image_url]?.uploaded_at ?? item.created_at, extracted_text: item.extracted_text ?? '', route: item.confirmed ? '/items/[id]' as const : '/confirmation/[id]' as const })),
    ...drafts.map(draft => ({ key: `draft-${draft.draft_id}`, id: draft.draft_id, screenshotId: draft.draft_id, item: draft.item, image_url: draft.image_url, image: images[draft.image_url], needsReview: true, created_at: images[draft.image_url]?.uploaded_at ?? null, extracted_text: draft.extracted_text, route: '/confirmation/[id]' as const })),
  ];
}
export function collectionCounts(items: SavedItem[], drafts: AnalyzeResponse[]): Record<string, number> {
  const entries = galleryEntries(items, drafts, {});
  return Object.fromEntries(COLLECTION_IDS.map(category => [category, entries.filter(entry => category === 'all' || entry.item.category === category).length]));
}
export function filterGallery(entries: GalleryEntry[], category: Category | 'all', search: string, sort: GallerySort): GalleryEntry[] {
  const query = search.trim().toLocaleLowerCase();
  const result = entries.filter(({ item, extracted_text, image }) => (category === 'all' || item.category === category) && (!query || [item.title, item.summary, extracted_text, item.event?.location, item.event?.registration_url, image?.name, ...item.tasks.map(task => task.title)].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
  return result.sort((a, b) => {
    if (sort === 'event') {
      const dateA = a.item.event?.date, dateB = b.item.event?.date;
      if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
      if (Boolean(dateA) !== Boolean(dateB)) return dateA ? -1 : 1;
    } else {
      const timeA = a.created_at ? Date.parse(a.created_at) : NaN, timeB = b.created_at ? Date.parse(b.created_at) : NaN;
      if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return sort === 'newest' ? timeB - timeA : timeA - timeB;
      if (Number.isFinite(timeA) !== Number.isFinite(timeB)) return Number.isFinite(timeA) ? -1 : 1;
    }
    // Prefer real images when dates tie; no fabricated dates for legacy drafts.
    return Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.key.localeCompare(b.key);
  });
}
