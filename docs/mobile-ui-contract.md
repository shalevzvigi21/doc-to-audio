# Mobile UI contract (for the Gemini UI jobs)

You are editing a COPY of `apps/web` (Next.js 14 App Router, React 18, TypeScript strict, Tailwind 3.4, lucide-react, class-variance-authority). Hebrew UI, `dir="rtl"`. Edit ONLY the files named in your job. Do not add dependencies. Do not touch the API, `public/sw.js`, `lib/offline.ts`, `lib/install.ts`, or `PlayerProvider.tsx` (they are done and tested).

## Design language (keep it; adapt, do not redesign)
- Tokens only, from `app/globals.css` + `tailwind.config.ts`: `bg-background`, `bg-card`, `bg-secondary`, `text-muted-foreground`, `bg-primary text-primary-foreground` (orange), `border`, `bg-soft`, `text-ok`, `text-warn`, `text-destructive`. No hex colors.
- Rounded, soft: cards `rounded-2xl`/`rounded-[28px]`, sheets `rounded-t-[32px]`. Font Rubik (already global). Counters/times use the `.num` class.
- RTL: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). User-provided text (file names, folder names) gets `dir="auto"`.
- Icons: `lucide-react` only (no emoji as icons).

## Phone rules
- Every tap target at least 44x44 px. Inputs 16px text on phones (the global CSS already enforces 16px under 640px).
- Phone = Tailwind `max-sm:` (under 640px). Desktop look at 640px and up must stay as it is today unless your job says otherwise.
- Respect safe areas: bottom padding `pb-[calc(16px+env(safe-area-inset-bottom,0px))]`, top `pt-[env(safe-area-inset-top,0px)]` for full-screen sheets.
- No hover-only information; add `active:` pressed states.
- Honour `prefers-reduced-motion` (already global).
- Accessibility: buttons have labels, dialogs use `role="dialog" aria-modal="true"`, focus moves into a sheet when it opens and returns to the trigger when it closes, Escape closes.

## Existing APIs you may use (read the files, do not change them)
- Player: `import { usePlayer } from "@/components/player/context"`. Value has: `track`, `playing`, `current`, `total`, `speed`, `sheetOpen`, `sleep: { kind: "off"|"minutes"|"end"; endsAt: number|null }`, `setSleep(minutes | "end" | null)`, `load`, `toggle`, `seek`, `skip`, `cycleSpeed`, `openSheet`, `closeSheet`.
- Offline downloads: `import { offlineSupported, isOffline, listOffline, downloadForOffline, removeOffline } from "@/lib/offline"`. `downloadForOffline({ id, name, duration }, onProgress(0..1, or -1 if unknown), signal)`; `id` is the JOB id (the same id used in `/api/audio/{id}` and `Track.id`).
- Install: `import { canPromptInstall, promptInstall, isIOS, isStandalone, INSTALL_AVAILABLE } from "@/lib/install"`. `window` fires `INSTALL_AVAILABLE` when `canPromptInstall()` changes.
- Strings: `import { he } from "@/lib/strings"`. Do NOT edit `lib/strings.ts`. Instead create a new file `lib/mobile-strings.ts` exporting `export const mobile = { ... }` with every new Hebrew string you need (grouped by feature, plain strings or small functions), and import it. Existing `he.*` keys may be reused.
- Server actions: `lib/actions/library.ts` etc. Reuse the ones `FileList.tsx` already calls; do not add new ones.
- Existing components to reuse rather than rewrite: `OpenAIVoicePicker`, `ImportantToKnow`, `GeminiQuota`, `OpenAIUsage`, `ThemeToggle`, `LogoutButton`, `Button`, `Input`, `cn` from `@/lib/utils`.

## Sheet component (job 0 creates it; later jobs import it)
`components/ui/sheet.tsx` exports:
```tsx
<Sheet open={boolean} onClose={() => void} title={string} fullScreenOnPhone?={boolean}>children</Sheet>
```
Behaviour: portal-free fixed overlay (`fixed inset-0 z-50`), backdrop click and Escape close, bottom-aligned on phones (`items-end`), centred card on `sm:`, `rounded-t-[32px]`, drag handle bar at the top; swipe down on the handle/header (pointer events, threshold 80px or fast flick) closes it; focus trap; focus returns to the previously focused element; body scroll locked while open; max height `92dvh` with the content scrolling inside; `fullScreenOnPhone` makes it `h-dvh` with no top radius under 640px. Also export `SheetAction` (a 56px-tall row button: icon, label, optional `danger`, optional `selected`, `onClick`) for action lists.
Use the existing `animate-sheet-up` / `animate-fade-in` classes from `tailwind.config.ts`.

## Output rules
- Write complete files (not diffs). Keep existing exports and props of the file you edit so other files keep compiling.
- When you finish, print a short list of the files you changed or created and any new Hebrew strings. Do not run builds; the reviewer does that.
