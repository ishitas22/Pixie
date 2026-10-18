# Pixie frontend — Milestone 5

Expo SDK 58, React Native, TypeScript, and Expo Router. Run commands from this directory with Node 22.13+ (Node 24 recommended for the TypeScript test runner).

```sh
npm ci
npm run web
```

Open the localhost URL printed by Expo (normally http://localhost:8081). To choose a port: `npm run web -- --port 8082`.

## Implemented

- Responsive Dashboard with Today, chronologically sorted Upcoming, and Needs Review.
- Category sidebar becomes a horizontal filter strip below 900px.
- Shared theme, application shell, agenda cards, and empty states.
- Router entry: `expo-router/entry`; routes: `src/app/`.
- Real screenshot selection, editable confirmation, shared state, browser persistence, and a editable saved-item view.
- Camera Roll gallery with category filters, search, sorting, original images, and Needs Review routing.
- Navigable monthly calendar of confirmed events with category colors and selected-day details.

## Mock data and contract

`src/types/api.ts` mirrors MVP v1 from the supplied `pixie-api-contract.md`. `src/mocks/dashboard.ts` creates `SavedItem[]` and analysis draft responses independently of components. No backend is required or contacted. Image URLs preserve contract paths; the Dashboard uses decorative draft previews instead of requesting nonexistent image bytes. No registration or task completion is implied.

Sample dates are relative to the local calendar day when the collection is first created; all seeded data is demo data. Confirmed events and unfinished task deadlines become separate agenda entries, so a workshop can have a registration deadline before its event. Undated items stay in collection counts but not the agenda. Needs Review uses analysis drafts, separately filtered by category. Sidebar counts represent saved items, not agenda occurrences or drafts.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform web
```

## Manual smoke test

1. Homepage: Today shows two events and one task deadline. Upcoming has five chronological entries. Needs Review has two drafts.
2. Select Career Opportunities: Today shows a workshop and application deadline; Upcoming shows registration before the AI workshop. Select Other to see empty agenda/review states. Clear filter or select All.
3. Open an event: the URL becomes `/items/<id>` and its title appears on a placeholder. Return using Back to dashboard.
4. Calendar, Camera Roll, Upload, and Review details open their labeled placeholders.
5. At laptop width the category list is on the left; at phone width it scrolls horizontally and cards stack.

Real backend analysis remains a future integration. See the Milestone 3 walkthrough below for current upload behavior.

## Milestone 3: upload and confirmation

Use Node 24 for the TypeScript test runner. Start with `npm run web -- --port 8083`, then open http://localhost:8083 in your browser. Keep using the same hostname and port: IndexedDB storage is scoped to that browser origin.

1. Click the header **+** or **Upload your screenshots** in the hero. Both directly invoke Expo DocumentPicker (one PNG/JPEG, maximum 10 MB). Canceling selection leaves the collection unchanged. `/upload` also offers a Choose a screenshot button.
2. Select an image. A short demo analyzing state appears, then a two-column Confirmation page displays the actual image and editable fields. Use Enlarge screenshot to inspect the original.
3. The simulated analyzer uses only the filename for the title, `other` as the default category, an empty summary/extracted_text, `event: null`, and `tasks: []`. No OCR, AI, registration, or network upload occurs. The two original sample drafts retain their explicit demo suggestions.
4. Edit title/category/summary. Optional event fields are `date`, `time`, `location`, `registration_url`; optional tasks have `title` and `due_date`. Empty optional values become `null`; a wholly empty event becomes `null`. Add/remove tasks freely.
5. Try an invalid date (02/31/2026), time (25:00), or URL (example.com): Confirm & Save shows errors and leaves the draft unsaved. Use MM/DD/YYYY, HH:MM in 24-hour time, and a full http(s) URL. A task needs a title; its deadline is optional.
6. For a Dashboard smoke test, set the event date or task deadline to today's local date, then Confirm & Save. The draft leaves Needs Review, category counts update, and Today shows the event/task. Future dates appear chronologically in Upcoming. Click the saved card to see its linked screenshot and saved information.
7. Save another image with no dates. It stays out of the agenda, and remains accessible under Your saved screenshots. Camera Roll now lists all saved items and drafts; Calendar now shows confirmed, dated events.
8. Back without confirming retains the edited draft in Needs Review. Refresh either the editor or a saved-item page to verify browser persistence. Selecting a file alone never confirms it.

The Context/reducer provider keeps contract-shaped drafts and saved items. A separate `images` map resolves contract `image_url` paths to local data URIs; these URIs never replace API fields. Browser persistence uses IndexedDB, including original image bytes, and reports storage failures in the app. Native builds retain in-memory state and cached image URIs for the session; native persistent storage is not implemented. Clearing browser site data removes the demo collection. No FastAPI endpoints are called.

Automated tests cover normalization, validation, mock responses, image metadata limits, reducer draft/confirm transitions, duplicate-save protection, screenshot linkage, and Dashboard date/category behavior. Run `npm run typecheck`, `npm run lint`, `npm test`, `npx expo install --check`, and `npx expo export --platform web`.

## Date display and editing saved items

All displayed dates and date inputs use **MM/DD/YYYY**, including event dates and task deadlines. The shared `dates.ts` utilities strictly validate real calendar dates (including Gregorian leap years); form conversion keeps shared state and contract records in **YYYY-MM-DD**. Empty optional dates become `null`. Dates are calendar strings, so timezone conversion cannot shift them by one day.

Open any saved item and click **Edit**. Change its title, category, summary, event details, registration URL, or tasks. Tasks support add, remove, optional deadlines, and an explicit completed checkbox. **Save Changes** replaces the same item through a mock `PATCH /api/items/{id}` operation using editable `ItemDraft` fields. Item ID, image URL, creation timestamp, and confirmation status are retained; existing task IDs and completion status are preserved. New tasks receive IDs. **Cancel** discards the local form without changing saved state. Draft Confirmation and saved-item editing share `ItemEditor`, but only drafts autosave valid edits before confirmation.

Test with `10/25/2026`, leap day `02/29/2028`, and invalid `02/31/2026`. Move an event to today's date to see it in Today, or a future date to see it in Upcoming. Change category, complete a task, add/remove another, save, and refresh. The same image/item remains, completed tasks leave deadline lists, and category counts/filters update immediately. Cancel a second edit and refresh to confirm no unsaved values escaped. Unconfirmed drafts remain separate in Needs Review.

## Milestone 4: Camera Roll

Open http://localhost:8083/camera-roll (or the Camera Roll icon in the header). Start Expo with `npm run web -- --port 8083` if needed. Dates throughout the app now display and accept **MM/DD/YYYY**, e.g. **10/25/2026**. API/state dates remain ISO. Existing persisted records require no migration.

The gallery derives its cards from the same `items`, `drafts`, and image map as the Dashboard. No separate database or duplicate collection is created. Real uploaded screenshots use original local image references; fixture records without images are explicitly marked demo samples. Pending drafts show Needs Review and open Confirmation. Confirmed records open Item Details. New upload timestamps are local image metadata, separate from API records; legacy saved records use their creation time and old drafts with unknown upload times sort last.

Test the gallery:
1. Open Camera Roll, click Upload, select a PNG/JPEG, edit a title and optionally enter **10/25/2026**, then confirm. Return to Camera Roll: its saved card should appear under Newest upload. Refresh and confirm its thumbnail remains.
2. Upload another image and go back without confirming. In Camera Roll its card should say Needs Review; clicking it must open Confirmation. Confirm it and verify there is one saved card in its place.
3. Filter by each sidebar category; on phones use the horizontal category strip. Search a title, summary, location, filename, task, or available draft extracted text. Search is case-insensitive and combines with category filtering. A nonsense query should show No screenshots found and Clear filters.
4. Use the Filter dropdown to select any of the three sort options. Event sorting compares event dates chronologically (including any past dates) and puts undated items last; task deadlines do not affect this sort. Upload sorting supports both directions. Real images win ties.
5. Open a card, Edit its title/category/date, save, then return to Camera Roll. The new values should be reflected immediately and after refresh. Complete tasks as before; gallery event-date sorting remains unchanged.
6. Try **02/31/2026** (invalid) and **02/29/2028** (valid leap day) in Confirmation or Item Details.
7. Resize the browser: desktop content uses 3–4 columns, tablet 2, phone 1. Collapsing the sidebar expands the available grid width.

Empty collections offer a first-upload state; empty search/filter results offer a reset. Seed demo records mean the initial collection is intentionally populated. All analysis remains simulated. Storage stays scoped to the same browser origin (hostname and port).

## Camera Roll controls and typography refinement

The six category chips share selection with the sidebar. The **Filter** select sorts by **Newest upload** (default), **Oldest upload**, or **Upcoming event (soonest first)**; it combines with category and search. On narrow screens category chips wrap and the dropdown moves below them. Grid columns are measured from the content width with a fixed 16px gap. Incomplete final rows keep the same card widths and start on the left.

No licensed Gotham Rounded files were found, so headings and branding use **Fredoka Bold (700)**. Body, labels, buttons, text inputs, and links use **Nunito Regular (400), Semibold (600), and Bold (700)** through a shared Typography module. Both Google Fonts packages include SIL Open Font License 1.1 license files. The fonts are bundled local package assets loaded with Expo Font, with no runtime Google Fonts request. Initial app rendering waits for loading to prevent font swaps; a load error falls back to system fonts. Icons keep their own icon font.

To verify: open Camera Roll, select Other, search for a known screenshot, and change Filter to Upcoming event; dated matches should precede undated ones. Reset to All and test both upload sort directions. At laptop widths inspect an incomplete final row: card widths and column positions must match the first row. Resize to a phone width to check wrapped chips and a usable dropdown. Typography applies to Dashboard, gallery, Confirmation, saved items/editor, navigation/sidebar, and Calendar.

## Typography weight refinement

The Pixie navigation and hero wordmarks retain their original Fredoka appearance, sizes, and spacing under a dedicated `PixieWordmark` font alias. All other display/section headings use Nunito ExtraBold 800. Event and gallery card titles use Nunito Bold 700; navigation, category controls, buttons, and labels use Nunito SemiBold 600; body text uses Nunito Regular 400 or Medium 500. Compressed heading/card letter spacing was removed, and section line heights were opened up. These fonts remain bundled through Expo Font with startup loading and system fallbacks.

## Milestone 5: Calendar and tasks

Open http://localhost:8083/calendar or click the header Calendar icon. Previous/next month controls navigate across years; Today returns to the current local date. Columns run Sunday–Saturday, teal marks today, and lavender marks the selected date. Click a date to inspect all its confirmed events in the day panel. Click an event to open its existing editable Item Details page. Sidebar categories filter the calendar. Smaller screens show category dots in cells and the selected-day list below the grid. Time-unspecified events have no fabricated time.

The calendar derives events from `SavedItem.confirmed` and `event.date` only. Pending analysis drafts, undated records, and task deadlines never become calendar events. Editing/removing event dates immediately updates this view through the existing shared store. No additional database or persistence schema is introduced. All numeric dates continue to display/input as MM/DD/YYYY, while stored/API dates remain ISO.

In Item Details click Edit to create, edit, remove, or complete tasks and set optional deadlines, then Save Changes. Cancel discards changes. The read view lists incomplete dated tasks chronologically, followed by undated tasks and completed tasks. Overdue incomplete deadlines lead Dashboard Today, followed by today's events/deadlines; future deadlines appear chronologically in Upcoming. Completed tasks remain in Item Details but disappear from pending Dashboard actions. Each deadline card links to its source item; overdue dates are explicitly labeled Overdue.

Browser smoke test:
1. Use next/previous month and Today. Select a date with multiple events; verify all are in the day list, then open one.
2. Change its event date, save, and return to Calendar. It must move to the new date. Clear the event date to remove it from the calendar while retaining the item in Camera Roll.
3. Add a task due yesterday, one due today, and one due later. Dashboard Today must prioritize overdue work; Upcoming shows only the future deadline.
4. Edit a task title/deadline, remove one task, and mark another complete. Save, check Dashboard, and refresh Item Details to verify completion and original image persistence. Optional deadlines may be blank.
5. An unconfirmed draft's suggested event and a task-only due date must never appear in Calendar.
6. Resize to phone width and select dates; inspect the day list beneath the compact month grid.

Branding remains Fredoka Bold 700 for the navigation wordmark and responsive hero (84px/3px spacing on desktop), with Nunito headings/body/control weights elsewhere. Tests now cover calendar alignment, leap months, year navigation, multiple/untimed events, exclusion rules, date edits/removal, and overdue Dashboard ordering alongside all existing upload/edit/gallery tests.

## Calendar visual refinement

Calendar now uses the full content width with one responsive header: title on the left, month arrows/month name/Today on the right. The selected-day panel was removed. Select a date to highlight it, and click an event pill directly to open Item Details on desktop or mobile. Dates with more than two events show + more; activating it expands the remaining clickable events inline, with consistent heights across that week.

Today has a lavender cell, purple accent, and filled purple date circle. A different selected date uses a warm-yellow marker. If today is also selected, a dashed purple accent and yellow ring distinguish both states. Category colors, data, filters, navigation, and MM/DD/YYYY date labels remain unchanged.

## Dashboard task visibility and cleanup

Your Tasks appears below Today/Upcoming and derives incomplete tasks from the existing saved-item collection, including undated tasks. Category selection applies to all three sections. Dated tasks sort chronologically (overdue first), with undated tasks last. Each task/source link opens Item Details. Its checkbox completes the original task in shared state through the mock task-completion operation; completion persists in IndexedDB and updates Today/Upcoming immediately. Completed tasks remain in Item Details.

To test, choose All or Career Opportunities, scroll to Your Tasks, click a task to inspect its source, then check its completion box on the Dashboard. It should disappear from pending lists. Refresh, open its source item, and verify it remains completed. You can mark it incomplete again in Edit. Choose a category without pending tasks for the empty state. Needs Review now uses a centered, larger empty message and retains its count and draft links. Decorative Today/Upcoming icons and requested gallery/review copy were removed.

Official logo: the user-provided **frontend/assets/Pixie.png** is now used beside the Fredoka Bold Pixie wordmark. BrandLogo uses a clipped viewport to remove the substantial white margins visually, while scaling the original proportionally and preserving the source file. The large hero wordmark stays unchanged.
