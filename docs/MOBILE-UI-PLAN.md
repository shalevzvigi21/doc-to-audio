# Mobile web (iPhone + Android) UI/UX plan

Goal: the current Hebrew/RTL web app feels native on a phone: one-handed, installable, and the audio keeps playing with the screen locked. Same design language as today (orange accent, graphite/black themes, Rubik, rounded cards). No redesign; we adapt.

## 1. Where the current UI stands

Already good on mobile
- Responsive Tailwind layout (`max-sm:` variants), RTL (`dir="rtl"`), dark/light theme.
- Bottom-sheet full player and a floating mini-player that already uses `env(safe-area-inset-bottom)`.
- Folder chips scroll horizontally; the upload button goes full-width on phones.

Gaps found in the code
| # | Gap | Where | Effect on a phone |
|---|---|---|---|
| 1 | No `viewport` export / `viewport-fit=cover`, no `theme-color` | `app/layout.tsx` | iPhone safe-area insets are 0, so the mini-player can sit under the home bar; browser bar color clashes with the theme |
| 2 | No web app manifest, icons or Apple meta tags | `app/` (no `public/`) | Cannot "Add to Home Screen"; opens inside Safari/Chrome UI |
| 3 | No Media Session API | player code | No lock-screen / notification controls; on iOS the audio often stops or shows no title when the screen locks |
| 4 | `min-h-screen` (100vh) | layout, auth, share | Content hidden behind the mobile browser toolbar |
| 5 | Inputs and buttons smaller than 16px text / 44px target (`text-sm`, `h-9`, `h-10`) | FileList rename, keys dialogs, `Button` sm/icon | iOS zooms the page when focusing an input; fingers miss small targets |
| 6 | Header carries Gemini pill + OpenAI pill + theme + logout | `TopBar`, library page | Overflows/wraps at 360-390 px width |
| 7 | Drag-and-drop dropzone as the main upload surface | `LibraryToolbar` | Desktop idiom; wastes the first screen on a phone |
| 8 | File row actions live in a small kebab popover; convert options in an inline drawer | `FileList` | Hard to reach and tap; popover can clip at screen edges |
| 9 | Waveform scrubbing uses pointer events | `Waveform` | Page scrolls instead of scrubbing unless `touch-action` is set |
| 10 | Render cold start (30-60 s) shows generic failures | server actions | "Could not reach the server" on first open from the phone |

## 2. Design principles

1. **Thumb zone first.** Primary actions (play, add document, convert) sit in the bottom 40% of the screen.
2. **One column, big targets.** Minimum 44x44 px, 16px+ text in inputs, 8px+ spacing between targets.
3. **Sheets instead of popovers.** Menus, convert options and key setup open as bottom sheets (the app already has the sheet pattern in the player).
4. **Audio is the product.** Lock-screen controls, resume position, and background playback matter more than any visual polish.
5. **Fail soft.** Slow server, no network, large uploads: say what is happening and keep the user's place.

## 3. Phases

### Phase 0: Foundations (small, do first)
- `app/layout.tsx`: export `viewport` (`width=device-width, initialScale=1, viewportFit=cover, themeColor` for light and dark).
- Replace `min-h-screen` with `min-h-dvh` everywhere.
- Inputs: 16px font on touch (`text-base`), height 44px; buttons `sm` and `icon` raised to 44px on `max-sm`.
- `touch-action: manipulation` on buttons (removes the 300 ms tap delay); `touch-action: none` on the waveform.
- Replace hover-only affordances with visible/pressed states (`active:` as well as `hover:`).
- Done when: no zoom on any input in iOS Safari, nothing hidden under the iPhone home bar, Lighthouse mobile "tap targets" passes.

### Phase 1: Installable app (PWA)
- `app/manifest.ts`: name "מסמך לאודיו", RTL, `display: standalone`, theme/background colors, `start_url: /library`.
- Icons 192/512 + maskable, `apple-touch-icon` 180, `apple-mobile-web-app-capable`, status-bar style.
- Android: install prompt button in the header menu (`beforeinstallprompt`). iOS: one-time hint "Share, then Add to Home Screen" (iOS has no install prompt).
- Minimal service worker: cache the app shell and show a friendly offline page. Audio is **not** cached in this phase.
- Done when: it installs on both platforms, opens full-screen with the right icon and splash color.

### Phase 2: Library screen on phone
- **Header:** brand + one status button. Gemini/OpenAI pills collapse into that button, which opens a "Voice engines" sheet (quota, spend, key setup). Theme toggle and logout move into a small menu.
- **Add document:** hide the drag-and-drop copy on touch devices; a prominent full-width "Add document" button plus a floating action button when scrolled. The native iOS/Android file picker handles Files, iCloud, Drive.
- **Rows:** 56-64 px tall, whole row opens the player when finished; the play button stays on the end side; status pill under the title.
- **Actions:** the kebab opens a bottom action sheet (rename, share, move, delete) with large rows; delete needs a confirm step inside the sheet.
- **Convert:** replaces the inline drawer with a bottom sheet: engine segmented control, voice picker (OpenAI), reading-layout checkbox, "Important to know" collapsed into an info row. One big "Convert" button at the bottom of the sheet.
- **Folders:** keep the chip row; add "long-press to rename/delete" via the same action sheet.
- Done when: every library task is doable with one thumb on a 360 px wide screen, no horizontal scroll.

### Phase 3: Player on phone (highest value)
- **Media Session API:** title, artwork (app icon), play/pause, seek back/forward 15 s, seek to position. This gives lock-screen and notification controls on Android and iOS.
- Keep the audio element mounted across navigation (already via `PlayerProvider`); verify it continues with the screen locked on iOS Safari and in the installed PWA.
- Mini-player sits above a safe-area bottom bar; full player is a sheet with swipe-down to close.
- Waveform: large touch scrubbing with a visible handle and haptic-like feedback (`navigator.vibrate` on Android only).
- Add playback speed control (0.75x to 2x) and a sleep timer (15/30/60 min, end of document). Resume position already saved; add "continue where you left off" on the library row.
- Done when: start playback, lock the phone, control it from the lock screen, unlock, and the position is right.

### Phase 4: Setup and account flows
- Auth forms: `autocomplete`, `inputmode`, password-manager friendly, large submit button, keyboard "go" key submits.
- Gemini/OpenAI key dialogs become full-screen sheets on phones, with a "Paste" button (clipboard API) next to the field and the guide links opening in a new tab.
- First-run: after registering on the phone, a single "Add your voice engine key" card instead of two popups.

### Phase 5: Resilience and polish
- Cold start: a "Waking up the server..." state with a timer, automatic retry (up to about 60 s) instead of an error. The keep-alive Worker makes this rare.
- Uploads from a phone: progress bar per file, retry button, clear message above 50 MB.
- Optional: "Download for offline" per document (Cache API for the MP3; note iOS may evict it).
- Skeleton loaders for the library and player; reduced-motion respected (already).

## 4. Rollout order and effort (rough)
| Phase | Effort | Visible win |
|---|---|---|
| 0 Foundations | 0.5 day | No zoom, no clipped bars |
| 3 Player (Media Session first) | 1 day | Lock-screen control. The big one. |
| 1 PWA | 0.5-1 day | Home-screen app |
| 2 Library | 2 days | Comfortable one-handed use |
| 4 Setup flows | 0.5 day | Easy first run |
| 5 Resilience/polish | 1 day | Fewer errors on mobile networks |

Suggested order: 0, then 3 (Media Session), then 1, then 2, 4, 5.

## 5. How we will test
- Widths 360, 375, 390, 430 px; portrait and landscape; light and dark; RTL (Hebrew) and long Hebrew filenames.
- Real devices: iPhone Safari (iOS 17/18) and installed PWA; Chrome on Android; Samsung Internet if available.
- Playwright device emulation for layout screenshots (iPhone 14, Pixel 7) in CI; manual checks for lock-screen audio, install, and file picker.
- Lighthouse mobile: PWA, accessibility, tap targets.

## 6. Open decisions
1. PWA install: yes (recommended) or plain mobile website only?
2. Bottom tab bar (Library / Now playing / Settings) or keep the single-page layout with a menu? Recommended: keep single page + sheets; fewer changes.
3. Offline downloads: now, later, or never?
