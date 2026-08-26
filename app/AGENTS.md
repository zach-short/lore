# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# House conventions (adapted from ezhomesteading/docs/conventions.md)

- Routes in `src/app/` are thin: default-export a page component that renders
  exactly one `*Screen` from `src/screens/<name>` (barrel import), plus the
  shared `ErrorBoundary` re-export. Nothing else lives in `src/app/`.
- kebab-case filenames; named exports everywhere except route files and config.
- Components are function declarations with a named `XxxProps` type above them.
  No `React.FC`, no enums (string literal unions), no `any`.
- Props: handlers are `onX` (locals `handleX`); booleans are `is/has/can`;
  ReactNode props end in `Slot`.
- One hook per file in a screen's folder (`use-<name>.ts`); extract logic from
  components once it grows past trivial.
- `lib/` is the only utility bucket (never `utils/` or `helpers/`).
- User-facing copy lives in `src/lib/strings.ts` — no inline literals in screens.
- Styling: Tailwind classes via the `src/tw` primitives against tokens defined
  in `src/global.css`; no raw hex in components. `src/theme.ts` mirrors the
  palette for JS-only consumers — change both together. Both color schemes must
  resolve (light-dark()).
- Data: TanStack Query only, keys from `src/lib/data/query-keys.ts` (domain
  root first). Loading/error/empty render through `DataLoading`/`DataError`
  (onRetry required)/`DataEmpty`.
- Pure domain logic lives in `src/lib/movienight/` with colocated `*.test.ts`
  (vitest). Write/adjust tests when touching scoring, filters, or reasons —
  they pin parity with the pipeline's `site/app.js` semantics.
- Platform divergence is by `.web.tsx` sibling files (tabs, data loading), not
  inline forks, except small `Platform.OS` gates for chrome.
- `bun` is the package manager; add packages with `bunx expo install <pkg>`.
  Keep the `lightningcss` resolution pin — native bundling breaks without it.
