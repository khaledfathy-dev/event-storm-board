/*
 * Event Storm Board — main toolbar.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var refs = {};
  var initialized = false;
  var saveError = null;
  var lastErrorToast = '';
  var lastErrorToastAt = 0;
  var PANEL_KEY = 'esb:v1:panels';
  var panels = { sidebar: true, inspector: true };
  var mobileQuery = null;

  function init() {
    if (initialized) return;
    initialized = true;

    refs = {
      app: document.getElementById('app'),
      name: document.getElementById('projectName'),
      saveStatus: document.getElementById('saveStatus'),
      save: document.getElementById('btnSave'),
      export: document.getElementById('btnExport'),
      import: document.getElementById('btnImport'),
      storage: document.getElementById('btnStorage'),
      undo: document.getElementById('btnUndo'),
      redo: document.getElementById('btnRedo'),
      zoomOut: document.getElementById('btnZoomOut'),
      zoomIn: document.getElementById('btnZoomIn'),
      zoomLabel: document.getElementById('zoomLabel'),
      fit: document.getElementById('btnFit'),
      grid: document.getElementById('btnGrid'),
      snap: document.getElementById('btnSnap'),
      minimap: document.getElementById('btnMinimap'),
      minimapBox: document.getElementById('minimap'),
      fullscreen: document.getElementById('btnFullscreen'),
      help: document.getElementById('btnHelp'),
      sidebar: document.getElementById('sidebar'),
      inspector: document.getElementById('inspector'),
      toggleSidebar: document.getElementById('btnToggleSidebar'),
      toggleInspector: document.getElementById('btnToggleInspector'),
      closeSidebar: document.getElementById('btnCloseSidebar'),
      fileInput: document.getElementById('fileInput')
    };

    refs.name.addEventListener('input', function () {
      ESB.store.setProjectMeta({ name: refs.name.value });
    });
    refs.name.addEventListener('blur', function () {
      if (!refs.name.value.trim()) {
        ESB.store.setProjectMeta({ name: 'Untitled Board' });
      }
      sync();
    });
    refs.name.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        refs.name.blur();
      }
    });

    refs.save.addEventListener('click', function () { save(); });
    refs.export.addEventListener('click', function () { ESB.projectIO.exportJson(); });
    refs.import.addEventListener('click', function () { refs.fileInput.click(); });
    if (refs.storage) {
      refs.storage.addEventListener('click', function () { ESB.storage.open(); });
    }
    if (refs.help) {
      refs.help.addEventListener('click', function () {
        /* Keep the opener focused so the dialog can restore focus on close. */
        if (document.activeElement !== refs.help) {
          try { refs.help.focus({ preventScroll: true }); } catch (err) { refs.help.focus(); }
        }
        ESB.a11y.openHelp();
      });
    }

    refs.fileInput.addEventListener('change', function () {
      var file = refs.fileInput.files && refs.fileInput.files[0];
      refs.fileInput.value = '';
      if (file) ESB.projectIO.importFile(file);
    });

    refs.undo.addEventListener('click', function () {
      if (ESB.store.undo()) sync();
    });
    refs.redo.addEventListener('click', function () {
      if (ESB.store.redo()) sync();
    });

    refs.zoomIn.addEventListener('click', function () { ESB.canvas.zoomIn(); });
    refs.zoomOut.addEventListener('click', function () { ESB.canvas.zoomOut(); });
    refs.zoomLabel.addEventListener('click', function () { ESB.canvas.resetZoom(); });
    refs.fit.addEventListener('click', function () { ESB.canvas.fitToContent(); });

    refs.grid.addEventListener('click', function () {
      var settings = ESB.store.getBoard().settings;
      ESB.store.updateSettings({ grid: !settings.grid }, { history: false });
      applySettings();
    });

    refs.snap.addEventListener('click', function () {
      var settings = ESB.store.getBoard().settings;
      ESB.store.updateSettings({ snap: !settings.snap }, { history: false });
      applySettings();
    });

    refs.minimap.addEventListener('click', function () {
      var settings = ESB.store.getBoard().settings;
      ESB.store.updateSettings({ minimap: !settings.minimap }, { history: false });
      applySettings();
    });

    refs.fullscreen.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreen);

    refs.toggleSidebar.addEventListener('click', function () {
      setPanel('sidebar', !isPanelOpen('sidebar'), { focus: true });
    });

    refs.toggleInspector.addEventListener('click', function () {
      var open = !isPanelOpen('inspector');
      if (open) ESB.inspector.sync();
      setPanel('inspector', open, { focus: true });
    });

    if (refs.closeSidebar) {
      refs.closeSidebar.addEventListener('click', function () {
        setPanel('sidebar', false, { returnFocus: true });
      });
    }

    if (global.matchMedia) {
      mobileQuery = global.matchMedia('(max-width: 980px)');
      var onViewportChange = function () { handleViewportChange(); };
      if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', onViewportChange);
      } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(onViewportChange);
      }
    }

    panels = readPanels();
    handleViewportChange();

    ESB.canvas.onViewportChange(function () { syncZoom(); });

    if (!ESB.projects.available()) {
      refs.saveStatus.textContent = 'Local storage unavailable — export to keep your work';
      refs.saveStatus.classList.add('save-status--error');
    }
  }

  function focusPanel(panel, selector) {
    if (!panel) return;
    var target = selector ? panel.querySelector(selector) : null;
    if (!target) target = panel;
    if (typeof target.focus !== 'function') return;
    setTimeout(function () {
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
    }, 0);
  }

  function readPanels() {
    var fallback = { sidebar: true, inspector: true };
    try {
      var parsed = JSON.parse(global.localStorage.getItem(PANEL_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        sidebar: parsed.sidebar !== false,
        inspector: parsed.inspector !== false
      };
    } catch (err) {
      return fallback;
    }
  }

  function persistPanels() {
    try {
      global.localStorage.setItem(PANEL_KEY, JSON.stringify(panels));
    } catch (err) {
      /* The layout still changes for this session. */
    }
  }

  function isMobile() {
    return mobileQuery ? mobileQuery.matches : global.innerWidth <= 980;
  }

  function isPanelOpen(panel) {
    if (!refs.app) return true;
    if (isMobile()) return refs.app.classList.contains(panel + '-open');
    return !document.documentElement.classList.contains(panel + '-collapsed');
  }

  function applyDesktopPanels() {
    document.documentElement.classList.toggle('sidebar-collapsed', !panels.sidebar);
    document.documentElement.classList.toggle('inspector-collapsed', !panels.inspector);
  }

  function handleViewportChange() {
    if (!refs.app) return;
    refs.app.classList.remove('sidebar-open', 'inspector-open');
    if (!isMobile()) applyDesktopPanels();
    syncPanels();
  }

  function setPanel(panel, open, options) {
    if (!refs.app || (panel !== 'sidebar' && panel !== 'inspector')) return;
    var opts = options || {};
    var isSidebar = panel === 'sidebar';
    var mobile = isMobile();
    var toggle = isSidebar ? refs.toggleSidebar : refs.toggleInspector;
    var panelEl = isSidebar ? refs.sidebar : refs.inspector;
    var other = isSidebar ? 'inspector' : 'sidebar';

    if (mobile) {
      refs.app.classList.toggle(panel + '-open', Boolean(open));
      if (open) refs.app.classList.remove(other + '-open');
    } else {
      panels[panel] = Boolean(open);
      persistPanels();
      document.documentElement.classList.toggle(panel + '-collapsed', !open);
    }

    if (mobile && open && opts.focus !== false) {
      focusPanel(panelEl, isSidebar ? '.palette-item' : '#btnCloseInspector');
    } else if (!open && opts.returnFocus && toggle) {
      try { toggle.focus({ preventScroll: true }); } catch (err) { toggle.focus(); }
    }

    syncPanels();
  }

  function togglePanel(panel) {
    setPanel(panel, !isPanelOpen(panel), { focus: true });
  }

  function applySettings() {
    var board = ESB.store.getBoard();
    ESB.canvas.syncGrid(board.settings);
    refs.minimapBox.classList.toggle('is-hidden', !board.settings.minimap);
    refs.grid.setAttribute('aria-pressed', String(board.settings.grid));
    refs.snap.setAttribute('aria-pressed', String(board.settings.snap));
    refs.minimap.setAttribute('aria-pressed', String(board.settings.minimap));
    ESB.minimap.sync();
  }

  function formatTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function syncStatus() {
    if (!ESB.projects.available()) {
      refs.saveStatus.textContent = 'Local storage unavailable — export to keep your work';
      refs.saveStatus.classList.add('save-status--error');
      refs.saveStatus.classList.remove('save-status--dirty');
      return;
    }
    refs.saveStatus.classList.remove('save-status--error', 'save-status--dirty');
    if (saveError) {
      refs.saveStatus.textContent = 'Autosave failed — export to keep your work';
      refs.saveStatus.classList.add('save-status--error');
      refs.saveStatus.title = saveError;
      return;
    }
    if (ESB.store.isDirty()) {
      refs.saveStatus.textContent = 'Unsaved changes';
      refs.saveStatus.classList.add('save-status--dirty');
      refs.saveStatus.removeAttribute('title');
      return;
    }
    var savedAt = ESB.store.getSavedAt();
    if (savedAt) {
      refs.saveStatus.textContent = 'Saved ' + formatTime(savedAt);
      refs.saveStatus.title = 'Last saved ' + new Date(savedAt).toLocaleString();
    } else {
      refs.saveStatus.textContent = 'Not saved yet';
      refs.saveStatus.removeAttribute('title');
    }
  }

  function syncZoom() {
    if (!refs.zoomLabel) return;
    var percent = Math.round(ESB.canvas.getZoom() * 100);
    refs.zoomLabel.textContent = percent + '%';
    refs.zoomLabel.setAttribute('aria-label', 'Zoom ' + percent + ' percent. Reset to 100 percent');
  }

  function syncPanels() {
    if (!refs.app) return;
    var sidebarOpen = isPanelOpen('sidebar');
    var inspectorOpen = isPanelOpen('inspector');
    if (refs.toggleSidebar) {
      refs.toggleSidebar.setAttribute('aria-expanded', String(sidebarOpen));
      refs.toggleSidebar.title = sidebarOpen ? 'Hide elements panel' : 'Show elements panel';
    }
    if (refs.toggleInspector) {
      refs.toggleInspector.setAttribute('aria-expanded', String(inspectorOpen));
      refs.toggleInspector.title = inspectorOpen ? 'Hide properties panel' : 'Show properties panel';
    }
  }

  function syncFullscreen() {
    var active = Boolean(document.fullscreenElement);
    refs.fullscreen.setAttribute('aria-pressed', String(active));
    refs.fullscreen.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var request = document.documentElement.requestFullscreen();
      if (request && request.catch) {
        request.catch(function () {
          ESB.ui.toast('Fullscreen is not available in this browser context.', { type: 'error' });
        });
      }
    } else {
      document.exitFullscreen();
    }
  }

  function reportSaveError(err) {
    var message = err && err.message ? err.message : String(err);
    saveError = message;
    var now = Date.now();
    if (message !== lastErrorToast || now - lastErrorToastAt > 15000) {
      lastErrorToast = message;
      lastErrorToastAt = now;
      ESB.ui.toast(message, { type: 'error', duration: 8000 });
    }
    if (initialized) syncStatus();
  }

  function clearSaveError() {
    saveError = null;
    lastErrorToast = '';
    lastErrorToastAt = 0;
  }

  function save() {
    try {
      ESB.projects.save(ESB.store.getProject());
      ESB.store.markSaved(new Date().toISOString());
      clearSaveError();
      ESB.ui.toast('Project saved');
      sync();
      return true;
    } catch (err) {
      reportSaveError(err);
      return false;
    }
  }

  function autosave() {
    if (!ESB.projects.available()) return;
    try {
      ESB.projects.save(ESB.store.getProject());
      ESB.store.markSaved(new Date().toISOString());
      clearSaveError();
      syncStatus();
    } catch (err) {
      reportSaveError(err);
    }
  }

  function sync() {
    if (!initialized) return;
    var project = ESB.store.getProject();
    if (project && document.activeElement !== refs.name) {
      refs.name.value = project.name;
    }
    if (project) document.title = project.name + ' — Event Storm Board';

    refs.undo.disabled = !ESB.store.canUndo();
    refs.redo.disabled = !ESB.store.canRedo();
    var undoLabel = ESB.store.undoLabel();
    refs.undo.title = undoLabel ? 'Undo ' + undoLabel + ' (Ctrl+Z)' : 'Undo (Ctrl+Z)';

    var board = ESB.store.getBoard();
    refs.grid.setAttribute('aria-pressed', String(board.settings.grid));
    refs.snap.setAttribute('aria-pressed', String(board.settings.snap));
    refs.minimap.setAttribute('aria-pressed', String(board.settings.minimap));
    refs.minimapBox.classList.toggle('is-hidden', !board.settings.minimap);

    syncZoom();
    syncPanels();
    syncStatus();
    syncFullscreen();
  }

  ESB.toolbar = {
    init: init,
    sync: sync,
    save: save,
    autosave: autosave,
    clearSaveError: clearSaveError,
    applySettings: applySettings,
    syncPanels: syncPanels,
    setPanel: setPanel,
    togglePanel: togglePanel,
    isPanelOpen: isPanelOpen
  };
})(window);
