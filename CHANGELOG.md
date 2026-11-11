# Changelog

All notable changes to Event Storm Board are recorded here. The project has no build step or runtime
dependencies; each entry describes the shipped source tree.

## Phase 8.1 — dark mode and collapsible panels — 2026-11-02 (current release)

Theme and panel-layout release: a persisted light/dark theme and side panels that can be hidden at
every screen size. Phases 6 (additional export formats) and 7 (multi-project picker and architecture
view) remain deferred.

### Added

- `modules/ui/theme.js` and a toolbar theme toggle: user-controlled light/dark mode with sun/moon
  icons, persisted in `esb:v1:theme`. With no explicit choice the app follows
  `prefers-color-scheme` and keeps following it until the user toggles.
- An inline boot script in `index.html` applies the saved theme and panel layout before first paint,
  so restored sessions never flash a light board.
- Dark theme tokens and component overrides for the canvas, toolbar, palette, inspector, modals,
  Storage panel, Help dialog, inputs, empty state, scrollbars and `prefers-contrast: more`.
- Theme-aware canvas chrome: minimap colours and the selected connection line/arrow follow the active
  theme, and group outlines and labels switch to dark variants.
- Persisted desktop panel layout: the Elements and Properties toggles now work at every width,
  collapse their grid column so the board takes the space, and store `{ sidebar, inspector }` in
  `esb:v1:panels`. Both panels can be hidden at once.
- A sidebar close button to match the existing inspector close button; both return focus to their
  toolbar toggle.

### Changed

- `index.html` declares `color-scheme: light dark` and keeps `meta[name="theme-color"]` in sync with
  the active theme.
- `toolbar.js` owns panel open/closed state for both desktop collapse and mobile drawers, syncs
  `aria-expanded` in either mode, and preserves the Phase 8 focus behaviour.
- `inspector.js` delegates open/close to the shared panel controller.
- The toolbar tools group now hides at 720 px (was 640 px) so the theme and both panel toggles stay
  reachable; below 1120 px the panel toggles become icon-only.
- README documents dark mode, panel controls, preference keys and the new module.

### Tests

- New theme/panel browser verification: **33/33 checks passing**, covering first-paint theme boot,
  toggle and reload persistence, system-preference fallback with explicit override, dark surfaces,
  selected connection theming, desktop collapse/restore/close buttons, both panels hidden, mobile
  drawers at 800 px, a 640 px overflow check and `file://` boot.
- Data suite **60/60** and the Phase 3, 4, 5 and 8 browser harnesses re-run with no console errors.

## Phase 8 — 2026-11-01

Phase 8 release: accessibility, keyboard and screen-reader workflows, UX polish, and release
documentation. Phases 6 (additional export formats) and 7 (multi-project picker and architecture
view) remain deferred.

### Added

- `modules/ui/a11y.js`: a polite live region for selection and action announcements, debounced
  selection narration, and the **Keyboard shortcuts and help** dialog.
- Help entry points in the toolbar and via `?` / `F1`. The dialog is grouped by workflow and lists
  every shortcut, including keyboard-only connection creation.
- Skip-to-board link, `<noscript>` notice, `theme-color`/`color-scheme` metadata, and hidden board
  instructions linked with `aria-describedby`.
- Element semantics: `role="button"`, `aria-pressed` selection state, `Space` selection, and
  `Enter`/`F2` inline rename exposed as a single-line textbox while editing.
- Focusable SVG connections with descriptive accessible names, `Enter`/`Space` selection, `F2`
  label editing, and focus preservation across re-renders.
- Group label names that report the group name, member count and selected state.
- **Connect selected elements** in the Properties panel, creating a flow connection between exactly
  two selected elements without using the pointer.
- Central contrast utility: `ESB.model.contrastRatio()` plus AA-safe ink selection shared by elements,
  chips and tests.
- Phase 8 stylesheet coverage: `.sr-only`, `.skip-link`, `.noscript`, Help dialog layout, toast
  dismiss controls, connection focus rings, `prefers-contrast: more` and `forced-colors: active`.

### Changed

- Modals now make `#app` inert, trap focus, label/describe themselves with unique IDs, restore focus
  to the opener, and close cleanly on `Escape`.
- Toasts each own a live role (`status` or `alert`), can be dismissed, and pause their timer while
  hovered or focused.
- Mobile panel toggles use `aria-expanded`/`aria-controls`; opening a drawer moves focus into it and
  `Escape` closes it.
- Board-only shortcuts (`Delete`, `F2`, arrows, `G`/`M`/`F`) no longer fire while focus is in the
  toolbar, palette, Properties panel or a dialog. Modified shortcuts remain global.
- Focus falls back to the board when a focused element or connection is deleted, and to the opener
  when the Properties drawer closes.
- The zoom control announces its current percentage, and unsaved work with unavailable storage now
  triggers the browser's unload warning.
- README rewritten for the release state: accessibility behaviour, full shortcut table, architecture
  entries, Phase 8 verification and the deferred Phase 6–7 roadmap.

### Fixed

- Modal titles/messages now use per-instance IDs, so multiple dialogs cannot collide.
- Programmatic Help-button activation restores focus correctly when the dialog closes.
- The Properties panel close button returns focus to its toolbar toggle.

### Tests

- Data/browser suite: **60/60 passing** (was 57/57), adding WCAG contrast-ratio and palette AA tests.
- Phase 8 browser verification: **45/45 checks passing**, including the accessibility tree, Help
  dialog focus lifecycle, keyboard connection/label flows, element and group keyboard semantics,
  focus fallbacks, 640 px layout, drawer state, contrast media queries and save/reload persistence.
- Phase 3, 4 and 5 browser harnesses re-run with no console errors; `file://` boot re-checked.

### Deferred

- Phase 6: HTML, SVG, PNG, PDF and Markdown exports. Export remains native JSON.
- Phase 7: multi-project picker, individual project duplicate/delete, and the architecture
  documentation view. The Storage panel still lists, repairs and clears projects.

## Earlier phase milestones

- **Phase 5 — persistence and storage:** Storage panel with usage summary, per-project counts and
  sizes, issue badges for orphaned, missing, unreadable and mismatched records, index repair,
  project-ID alignment, clear-all, duplicate-ID import copies, and shared metadata normalisation.
- **Phase 4 — selection and grouping:** full selection model, group outlines and membership,
  group-aware movement and selection, and refined bounded-context membership.
- **Phase 3 — connections:** SVG overlay with edge ports, curved arrows, editable labels, link types
  and styles, direction swap, and connection-aware selection and deletes.
- **Phase 2 — modeling workflow:** palette, elements, drag/resize, inline editing, inspector,
  undo/redo, autosave and native JSON import/export.
- **Phases 0–1 — foundation:** structure, model, validation, history, shell, design tokens, tests,
  infinite canvas, pan/zoom, grid, minimap, fullscreen and the responsive layout.
