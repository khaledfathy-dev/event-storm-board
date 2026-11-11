# Event Storm Board

A standalone Event Storming workspace for domain-driven design workshops. Pure HTML5, CSS3 and
vanilla JavaScript — no frameworks, no build step, no backend, no dependencies. Open `index.html`
and model.

> **Status:** Phases 0-5 and Phase 8 are complete (application shell, infinite canvas, element
> palette, direct manipulation, selection, inspector, undo/redo, autosave, JSON persistence, SVG
> connections with editable labels, visual groups, refined bounded-context membership, hardened
> storage with import/repair controls, plus a full accessibility and UX hardening pass with release
> documentation). A Phase 8.1 pass adds a persisted dark theme and collapsible side panels. The
> additional export formats (Phase 6) and the multi-project picker/architecture view (Phase 7) are
> intentionally deferred; see the [roadmap](#roadmap) and [CHANGELOG.md](CHANGELOG.md).

---

## Quick start

1. Open `index.html` directly in a modern browser (Chrome, Edge, Firefox or Safari).
2. Drag an element from the left palette onto the board, or click a palette item to add it at the
   centre of the viewport.
3. Double-click an element (or press `F2`) to rename it inline. Select it to edit the full record in
   the right-hand panel.
4. Hover an element and drag from one of its four edge ports onto another element to draw a
   connection. Click a line or its label to edit the link in the inspector.

No installation, server or network access is required. Everything runs locally in the browser and
is stored in `localStorage`.

> Serving the folder over HTTP (`python -m http.server`, `npx serve`, IIS, …) also works and is
> convenient while developing, but the app is designed for `file://`.

---

## What works today

### Workspace and canvas

- Infinite-feeling pannable canvas with a dotted grid.
- Pan with `Space` + drag, the middle mouse button, or trackpad scrolling.
- Zoom with `Ctrl`/`⌘` + scroll (zoom to cursor), the toolbar controls, or `+` / `-`.
- Fit-to-screen (`Ctrl+0`) and reset-to-100 %.
- Optional grid, grid snapping (20 px), minimap and fullscreen.
- Minimap navigation: click or drag inside the minimap to move the viewport.
- Multi-selection with marquee drag or `Shift`/`Ctrl`/`⌘` + click.
- Selection-aware keyboard shortcuts, arrow-key nudging (hold `Shift` for 10 px steps).
- Responsive layout: side panels become drawers below 980 px; a compact toolbar preserves zoom
  controls on smaller desktops.

### Theme and panel layout

- **Theme** in the toolbar switches between light and dark mode. The choice is saved in
  `esb:v1:theme`; when no choice has been made yet, the app follows the operating system's
  `prefers-color-scheme` and keeps following it until you toggle.
- A small inline script applies the saved theme and panel layout before the stylesheet paints, so a
  restored session does not flash the wrong theme.
- Dark mode restyles the canvas, toolbar, palette, inspector, dialogs, Storage panel and scrollbars
  while keeping the ten element colours and three connection colours recognisable. The minimap and
  the selected connection line/arrow follow the active theme too.
- **Elements** and **Properties** in the toolbar show or hide each side panel at any screen width.
  On desktop the panel's grid column collapses and the board takes the space; both panels can be
  hidden at once. The preference is saved in `esb:v1:panels` and survives reload.
- The close buttons in both panel headers do the same thing and return focus to the matching toolbar
  toggle. Below 980 px the toggles keep opening the familiar drawers, and `Escape` closes them.

### Event Storming elements

Ten element types, each with a distinct colour, default size and minimum size:

| Element | Colour | Purpose |
| --- | --- | --- |
| Domain Event | Orange | Something meaningful that happened |
| Command | Blue | An intent to change state |
| Aggregate | Yellow | Consistency boundary |
| Actor | Light yellow | A person or role |
| External System | Pink | A system outside your boundary |
| Policy / Process | Lilac | Reactive business rule |
| Read Model | Green | Data used to decide |
| Bounded Context | Light blue container | Container for a subdomain |
| Hotspot / Question | Red | Conflict or open question |
| Note | White | Free-form annotation |

- Drag from the palette or click to add; a new element opens in inline rename mode immediately.
- Move elements freely, with optional snapping to the grid.
- Resize from the bottom-right corner (minimum sizes enforced).
- Bounded contexts are resized containers; drop an element inside one to associate it, or pick a
  context in the inspector. Dragging a context by its header moves its children with it; its
  interior stays free for the rest of the board. The inspector shows the member count and can select
  every member in one action.
- Duplicate (`Ctrl+D`, inspector button) and delete (`Delete`, inspector button, multi-selection).
- Editable title, description, business rules, notes and arbitrary custom metadata.
- Stable element IDs generated with `crypto.randomUUID` when available.

### Connections

- Four edge ports per element appear on hover or selection; drag from a port onto another element
  to create a link. The drop target is highlighted while dragging, and release outside an element
  cancels.
- Curved SVG arrows are drawn beneath cards but above bounded-context containers, so context
  relationships stay visible. Links render live while elements are dragged or resized.
- Three connection types with distinct colours and defaults, plus an independent solid/dashed line
  style:

  | Type | Colour | Default style | Use for |
  | --- | --- | --- | --- |
  | Flow | Slate | Solid | Command → event and other causal flow |
  | Association | Grey | Dashed | Loose or read-model relationships |
  | Policy link | Violet | Solid | Policies reacting to events |

- Click a line or its label to select the connection; the inspector edits the label, type and line
  style, swaps the direction, or deletes the link.
- Double-click a connection (or its label) to edit the label inline. `Enter` commits and `Escape`
  cancels. `Delete` removes the selected link.
- Keyboard-only alternative: select exactly two elements and use **Connect selected elements** in the
  Properties panel. The new link is selected and its label field receives focus.
- Focused connections behave like buttons: `Enter`/`Space` selects them, `F2` edits the label, and
  focus returns to the link after inline editing.
- Connection selection is separate from element selection; selecting an element clears it, and
  deleting an element removes every link that references it (undoably).
- The minimap draws links between element centres.

### Groups

- Select two or more elements (bounded contexts are containers, not group members) and press
  `Ctrl+G` or use **Group selection** in the inspector. Groups are named automatically (`Group 1`,
  `Group 2`, …) and can be renamed from the single- or multi-selection inspector.
- Each group draws a dashed outline and a clickable label around its members, above bounded-context
  backgrounds and below cards and connections. Clicking any member selects the whole group;
  `Alt`-click selects only that member. Clicking or pressing `Enter` on the group label also selects
  every member. The label's accessible name reports the group name, member count and selection state.
  Dragging any grouped element moves the entire group as a unit, preserving internal spacing and the
  outline bounds. A marquee that touches one member selects the whole group.
- `Ctrl+Shift+G`, **Ungroup**, or removing the element membership dissolves the group. Duplicating a
  group creates a new group with copied members and fresh IDs.
- Groups require at least two valid members. Deleting a member that leaves a group with fewer than
  two members dissolves the group and clears the survivor's `groupId`, so no dangling membership is
  persisted.

### State, history and persistence

- Every meaningful change is undoable/redoable (60 snapshots, coalesced typing/nudging) with
  descriptive labels in the toolbar tooltip.
- Autosave 600 ms after the last meaningful change, plus a synchronous save on page unload.
- Manual save with `Ctrl+S`; the toolbar shows "Saved 14:32", "Unsaved changes", "Autosave failed"
  or a storage error.
- Project name editing in the toolbar; saved to the project record.
- JSON export and import (native format) with full validation and repair warnings.
- Import replaces the open board only after confirmation; invalid files never touch the current
  board. If the current board has unsaved changes, it is saved first; if that fails, the import
  asks before discarding them.
- Importing a file whose project ID already exists in this browser creates an independent copy with
  a fresh ID and an "(imported)" name, so nothing already saved is overwritten.
- Custom metadata is bounded on import and during editing: 40 fields maximum, keys trimmed to 60
  characters, values to 500, and prototype keys (`__proto__`, `constructor`, `prototype`) rejected.
- Storage is per project (`esb:v1:project:<id>`), with a separate index, so one large board cannot
  corrupt the project list. Quota errors are reported with an actionable message.
- **Storage** in the toolbar shows approximate usage and every stored project, flags orphaned,
  missing and unreadable records, can rebuild the project list from the boards themselves, and can
  delete all local projects after an inline confirmation.

### Accessibility and UX details

- Landmark structure (`banner`, `main`, labelled asides), a **Skip to board** link, and a
  `<noscript>` warning for browsers with scripting disabled.
- Dedicated polite live region (`#srStatus`) announces selection changes, groups, connections and
  keyboard actions; announcements are debounced so rapid navigation is not noisy.
- Every interactive control has an accessible name. Icon-only toolbar buttons use `aria-label`,
  toggles use `aria-pressed`/`aria-expanded`, and the toolbar is split into labelled groups.
- Elements are `role="button"` with `aria-pressed` selection state. `Space` selects, `Enter`/`F2`
  renames, and inline rename exposes `role="textbox"` while editing before restoring button
  semantics and focus.
- Connections are focusable buttons inside the SVG overlay with descriptive names ("Flow
  triggers from Place Order to Order Placed"). `Enter`/`Space` selects, `F2` edits the label, and
  focus is preserved across re-renders.
- Focus falls back to the board when a focused element or connection is deleted, and returns to the
  opener when the Properties drawer or a dialog closes.
- Modal dialogs set `aria-modal`, label and describe themselves, make the background `#app` inert,
  trap focus, close on `Escape`, and restore focus to the opener. Toast notifications each own a
  live role and include a dismiss button; hover/focus pauses their timer.
- The built-in **Keyboard shortcuts and help** dialog opens from the toolbar or `?` / `F1` and
  documents every workflow, including keyboard-only connection creation.
- WCAG contrast-aware ink is chosen for every element and connection chip. `contrastRatio` is
  exported from the model, and tests assert that all ten palette colours reach at least 4.5:1.
- `prefers-reduced-motion`, `prefers-contrast: more` and `forced-colors: active` are supported.
- Mobile drawers expose `aria-expanded`, move focus into the opened panel, and close on `Escape`.
- Empty state with quick-add actions; meaningful validation errors; no placeholder buttons.
- Autosave keeps working when storage is available. If storage is unavailable, leaving the page
  with unsaved work triggers the browser's unload warning.
- Responsive down to tablet widths; desktop-first by design.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` + drag / middle-drag | Pan the canvas |
| `Ctrl`/`⌘` + scroll | Zoom to cursor |
| `+` / `-` | Zoom in / out |
| `Ctrl+0`, `Home` | Fit board to screen |
| `G` | Toggle grid |
| `M` | Toggle minimap |
| `F` | Toggle fullscreen |
| `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Save project |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+G` | Group the selection |
| `Ctrl+Shift+G` | Ungroup the selection |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Delete the selected elements or connection |
| Arrow keys (+ `Shift`) | Nudge selection by 1 px (10 px) |
| `Space` / `Enter` (element focused) | Select the focused element |
| `F2` / `Enter` (element focused) | Rename inline (`Escape` cancels) |
| `Tab` | Move through the toolbar, palette, board, connections and Properties panel |
| `Enter` / `Space` (connection focused) | Select the connection |
| `F2` (connection focused) | Edit the connection label inline |
| `?` / `F1` | Open the keyboard shortcuts and help dialog |
| `Escape` | Clear selection, cancel editing, close the open dialog or mobile drawer |

---

## Architecture

```
index.html                  Application shell and script order
styles.css                  Design tokens, layout, canvas, panels, responsive rules
app.js                      Bootstrap, autosave scheduling, global error handling
modules/
  core/
    model.js                Element/project factories, IDs, schema constants, geometry helpers
    validate.js             Import validation, normalisation and repair reporting
    history.js              Snapshot undo/redo with coalescing and a capped stack
    projects.js             localStorage project records, index, usage scan and repair
    store.js                Central board state, selection, mutations, subscriptions
    files.js                File-name/date helpers and blob downloads
  board/
    canvas.js               Viewport transform, pan, zoom, grid, fit, space-pan
    elements.js             DOM reconciliation, drag, resize, inline title editing
    connections.js          SVG arrow overlay, ports, link creation, label editing
    groups.js               Group bounding outlines, labels and group selection
    selection.js            Marquee selection, group expansion and deselection
    minimap.js              Canvas-rendered minimap and navigation
  ui/
    palette.js              Palette definition and drag/drop into the board
    inspector.js            Properties panel for single/multiple selection
    toolbar.js              Toolbar wiring, save status, toggles, fullscreen, panel layout, drawer focus
    storage.js              Storage diagnostics, repair and clear panel
    shortcuts.js            Global keyboard shortcuts and the Help key
    modal.js                Accessible modal, confirm and toast primitives
    a11y.js                 Live-region announcements, selection narration and Help dialog
    theme.js                Light/dark theme preference, metadata and canvas refresh
  io/
    project-io.js           JSON export, hardened import flow and duplicate-ID copies
tests/
  test.html                 Browser test runner
  tests.js                  60 assertions over model, validation, history, store, groups, connections, storage and contrast
```

Key architectural rules:

- **The data model is never read from the DOM.** Rendering is one-way; every exporter will read from
  the model.
- **All mutations go through `ESB.store`**, which records history, marks the board dirty and notifies
  subscribers. The canvas owns only viewport state and writes it back silently.
- **Classic scripts, explicit load order.** ES modules are blocked on `file://` in Chrome, so each
  module attaches to the `window.ESB` namespace instead. Syntax is still ES6+.
- **The native JSON envelope is the source of truth.** Other export formats are projections of it.
- **The project index is a rebuildable cache.** Each board lives under its own key, so a damaged or
  missing index can be reconstructed by Storage → Repair.

---

## Project data model (schema `1.0.0`)

```json
{
  "app": "event-storm-board",
  "schemaVersion": "1.0.0",
  "exportedAt": "2026-10-31T12:00:00.000Z",
  "project": {
    "id": "prj_...",
    "name": "Checkout Workshop",
    "description": "",
    "version": "1.0.0",
    "createdAt": "2026-10-31T11:00:00.000Z",
    "updatedAt": "2026-10-31T12:00:00.000Z",
    "metadata": {},
    "board": {
      "elements": [
        {
          "id": "el_...",
          "type": "domainEvent",
          "title": "Order Placed",
          "description": "Customer submitted a checkout.",
          "businessRules": "",
          "notes": "",
          "x": 90,
          "y": 130,
          "width": 190,
          "height": 92,
          "z": 2,
          "color": null,
          "contextId": "el_context",
          "groupId": null,
          "metadata": { "owner": "Checkout" },
          "createdAt": "2026-10-31T11:10:00.000Z",
          "updatedAt": "2026-10-31T11:10:00.000Z"
        }
      ],
      "connections": [
        {
          "id": "cn_...",
          "from": { "elementId": "el_command", "side": "right" },
          "to": { "elementId": "el_event", "side": "left" },
          "type": "flow",
          "style": "solid",
          "label": "emits",
          "metadata": {}
        }
      ],
      "groups": [
        {
          "id": "grp_...",
          "name": "Checkout Pair",
          "elementIds": ["el_command", "el_event"]
        }
      ],
      "viewport": { "x": 120, "y": 110, "zoom": 1 },
      "settings": {
        "grid": true,
        "gridSize": 20,
        "snap": true,
        "minimap": true,
        "showConnectionLabels": true
      }
    }
  }
}
```

Rules enforced by the importer:

- The `app` marker must be `event-storm-board` (a bare project object imports with a warning).
- Schema major version must be `1`; newer minor versions import with a warning.
- Element `type` must be one of the ten defined types; IDs must be non-empty and unique.
- Connections must reference existing elements; dangling links are removed with a warning. Links that
  point at the same element are dropped the same way.
- Connection `type` and `style` are normalised to the allowed sets, and `from`/`to` sides default to
  `auto` when unknown.
- Context references must point at a bounded context; invalid references are cleared with a warning.
- Group IDs must be unique and members must reference existing, non-container elements. Repeated
  members are removed, an element can belong to only one group, and groups with fewer than two valid
  members are dropped. `element.groupId` is rebuilt from `board.groups` so membership never dangles.
- Numeric strings are coerced, positions rounded, and undersized elements enlarged to type minimums.
- Custom metadata is normalised: at most 40 fields, keys trimmed to 60 characters, values to 500,
  null values skipped and reserved prototype keys rejected. Repairs are reported as warnings.
- If the file's project ID already exists in local storage, the import becomes a fresh-ID copy named
  "<name> (imported)" instead of overwriting the stored board.
- Import failures list each problem and leave the open board untouched.

---

## Persistence

| Key | Contents |
| --- | --- |
| `esb:v1:index` | Project summaries (name, dates, element/connection/group counts, size, last save) |
| `esb:v1:current` | ID of the project to restore on load |
| `esb:v1:project:<id>` | Full native JSON envelope for that project |
| `esb:v1:theme` | Last explicit `light` / `dark` choice; absent means follow the system |
| `esb:v1:panels` | Desktop panel layout, e.g. `{"sidebar":true,"inspector":false}` |

The app restores the last project on load; otherwise it starts a fresh "Untitled Board". Autosave
is debounced and also runs on `beforeunload`. If storage is unavailable (private mode, blocked site
data, quota exceeded), the app explains the problem and keeps working in memory; use Export to keep
the board.

Theme and panel preferences are UI settings rather than project data: they are intentionally left
untouched by **Delete all**, because clearing the boards should not reset your display choices.

### Storage tools

The **Storage** toolbar button opens a diagnostics panel built from the actual `localStorage`
contents, not just the index:

- approximate bytes used by the app, by project records and in total;
- every stored board with its element, connection and group counts, size and last save;
- explicit badges for the current project, boards missing from the index, index entries whose data
  is gone, and records that cannot be parsed or validated;
- **Repair**, which rebuilds the index from the stored boards, restores orphaned boards, repairs an
  inconsistent project ID and removes stale or unreadable entries after confirmation;
- **Delete all**, which removes the project records, index and current pointer, leaves the open board
  in memory, and marks it as no longer saved. Autosave resumes with the next edit.

Repair and delete-all use inline confirmations inside the panel, so the panel never opens a second
modal on top of itself. Project switching, individual project deletion and duplication remain in
Phase 7.

---

## Tests

Open `tests/test.html` in a browser (or serve the folder and visit `/tests/test.html`). The runner
is framework-free and prints pass/fail with stack traces, plus `window.__ESB_TEST_RESULTS__` for
automation.

Current coverage: **60/60 passing** across:

- project/element factories, defaults, unique IDs, contrast-safe ink selection;
- content bounds and envelope construction;
- import validation: round-trip fidelity, foreign app markers, bare projects, unsupported schema,
  unknown types, duplicate IDs, dangling and self-referencing connections, invalid context
  references, coercion/repair and metadata key/value sanitation;
- snapshot undo/redo, coalescing and stack limits;
- store mutations, selection pruning, cascade deletes, duplication (including copied context
  references), atomic move+context updates, metadata, project metadata and stats;
- connections: creation and normalisation, rejected self/unknown links, sanitised type/style/label
  updates, direction swap, delete/undo, selection interplay and import repair;
- groups: creation and derived membership, two-member minimum and container exclusion, regrouping
  that dissolves orphaned groups, group-aware moves and selection, ungroup/rename undo, duplicated
  membership, delete cascade and import repair;
- storage: index summaries with element/connection/group counts, usage reporting, orphan recovery,
  index rebuild after corruption, removal of stale entries and unreadable records, project-ID
  alignment, scoped clear-all, duplicate-ID import copies, live metadata sanitation and the explicit
  unsaved state;
- accessibility: WCAG contrast-ratio maths, symmetry and extremes, and an AA (4.5:1) guarantee for
  the ink used on every palette colour.

Manual regression checks performed in a real browser for this checkpoint: palette drag/click add,
inline rename, inspector edits, type switching, metadata rows, context assignment, container drag
with children, resize, marquee, pan, zoom-to-cursor, fit, minimap navigation, grid/snap/minimap
toggles, undo/redo of move/delete/nudge, autosave, reload restoration, JSON export round-trip, valid
import, invalid/foreign import errors, warning flow, responsive layouts at 1600/1280/1024/900 px and
the inspector drawer.

Phase 3 checks additionally covered: port hover/reveal, pointer-drag link creation with target
highlight, inspector label/type/style edits, direction swap, inline label edit commit/cancel,
Delete with undo, cascade removal when an element is deleted, live path updates during drag, minimap
link rendering, persistence across reload, real pointer hit-testing on solid and dashed links, and
connection layers above bounded-context containers. All checks ran with no console errors.

Phase 4 checks additionally covered: real `Ctrl+G` grouping, group outline and label rendering,
group selection from a member click, `Alt`-click single-member selection, group rename from the
single and multi inspectors, pointer drag moving both members and the outline by the same delta,
`Ctrl+Shift+G` ungroup with `Ctrl+Z` restore, bounded-context member count and **Select members**,
persistence across reload, and a 640 px compact layout. All checks ran with no console errors.

Phase 5 checks additionally covered: the Storage panel summary and project counts, injected orphan,
missing and unreadable records, issue reporting, inline repair confirmation and repair results,
duplicate-ID import as a separate copy, saving a dirty current board before import, the dirty-board
warning, delete-all confirmation and empty state, no autosave repopulation after clearing, autosave
resuming on the next edit, a simulated quota failure showing the persistent toolbar error and
recovering after a successful save, and a reload with no console errors. The Storage panel was also
measured at 640 px with no horizontal overflow, and the app was re-checked from `file://`.

Phase 8 checks additionally covered, in a real browser with the accessibility tree enabled:

- toolbar, palette, board, connections and Properties panel are reachable with `Tab`, and every
  interactive control in the accessibility tree has a non-empty accessible name;
- the Help dialog opens from the toolbar, `?` and `F1`; the background is inert, focus starts inside,
  `Escape` closes it, and focus returns to the opener;
- keyboard-only connection creation from a two-element selection, connection `F2` label editing,
  label persistence and focus restoration;
- element `Space` selection, `Enter` inline-rename textbox semantics, `Escape` cancellation and
  focus fallback after deletion;
- group labels that report name, member count and selected state, with focus preserved after the
  group is selected from the keyboard;
- live-region presence, no duplicate IDs, and 45 automated checks passing with no console errors;
- the 640 px layout with no horizontal overflow, visible Help button, collapsed tool group, drawer
  `aria-expanded` state, focus moved into the drawer, and `Escape` to close;
- `prefers-contrast`, `forced-colors` and `prefers-reduced-motion` stylesheets present, plus a
  screenshot review of the Help dialog at 1400 px and 560 px;
- save/reload persistence after the accessibility changes, and a fresh `file://` boot.

Phase 8.1 theme/panel checks additionally covered, in a real browser:

- theme boot before the app modules initialise, the toolbar toggle, `esb:v1:theme` persistence across
  reload, and the system `prefers-color-scheme` fallback with an explicit override on top;
- dark surface, canvas and `color-scheme` values, themed `theme-color` metadata, and a selected
  connection rendered with the light accent;
- desktop collapse and restore for both panels, both hidden at once (canvas spans the full width),
  sidebar and inspector close buttons, focus return to the owning toolbar toggle, and layout
  persistence across reload;
- mobile drawers at 800 px, panel swapping, focus into the drawer and `Escape` closing;
- a 640 px layout with no horizontal overflow, visible theme and panel toggles, and icon-only panel
  buttons; plus a fresh `file://` boot.

All 33 checks passed with no console errors, and the Phase 3, 4, 5 and 8 browser harnesses were
re-run clean.

A local static server is only needed for the automated browser checks; it is not part of the app.

---

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Structure, model, validation, history, shell, design tokens, tests | Done |
| 1 | Canvas, pan/zoom, grid, minimap, fullscreen, responsive shell | Done |
| 2 | Palette, elements, drag/resize, inline editing, inspector, undo/redo, autosave, JSON I/O | Done |
| 3 | SVG connection overlay, ports, arrows, connection labels and editing | Done |
| 4 | Full selection model, grouping/ungrouping, refine container membership | Done |
| 5 | Expanded persistence/import hardening and project storage controls | Done |
| 6 | HTML, SVG, PNG, PDF and Markdown exports | Deferred |
| 7 | Multi-project picker, duplicate/delete projects, architecture documentation view | Deferred |
| 8 | Accessibility, keyboard/screen-reader workflows, Help dialog, contrast and release docs | Done |
| 8.1 | Persisted dark mode and collapsible side panels | Done |

### Known limitations at this checkpoint

- Export currently produces the native JSON file. The Export button is functional; additional
  formats are deferred until Phase 6 adds an export menu.
- Connections can be created with the pointer (edge ports) or, without a mouse, by selecting two
  elements and using **Connect selected elements** in the Properties panel. Freehand keyboard-only
  port navigation is not implemented.
- Only the current project can be opened; the multi-project picker is deferred to Phase 7. The
  Storage panel lists, repairs and clears projects, but does not switch to one or delete an
  individual board yet. Multiple projects are already stored independently, so no migration will be
  needed.
- Groups are flat: they group existing elements, cannot be nested, and have no independent notes or
  metadata. Bounded contexts remain the tool for subdomain containment.
- Group outlines are derived from the members' live bounding box; an outline can therefore overlap
  other elements while a group is spread across the board.
- `localStorage` is typically limited to about 5 MB per origin. Very large boards should be exported
  as JSON; a storage-full message tells you exactly that.
- Theme and panel preferences are stored per browser and are not part of the exported project JSON.
  A board opened on another machine starts from that machine's system theme and default open panels.
- The Help dialog and the accessibility improvements cover current Chromium, Firefox and Safari
  behaviour; forced-colors support is verified in Chromium on Windows.

---

## Browser support

Tested in current Chromium (Chrome/Edge). The code uses modern JavaScript, Pointer Events,
`ResizeObserver`, CSS custom properties and `color-mix` (with a fallback for the aggregate border).
Firefox and Safari 16.4+ should work; no legacy browser support is claimed.

---

## License

Created for internal architecture workshops. Add a licence before distributing externally.
