import type { PixieState } from '../state/model';
// Native demo uses session memory. Metro resolves persistence.web.ts for browsers.
export async function loadCollection(): Promise<PixieState | null> { return null; }
export async function persistCollection(_state: PixieState): Promise<void> { /* session only */ }
