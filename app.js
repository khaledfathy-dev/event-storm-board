/*
 * Event Storm Board — application bootstrap.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var autosaveTimer = null;
  var booted = false;
  var lastErrorAt = 0;

  function showEmptyState() {
    var empty = document.getElementById('emptyState');
    if (!empty) return;
    empty.hidden = ESB.store.getElements().length > 0;
  }

  function scheduleAutosave() {
    if (!ESB.projects.available()) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      if (ESB.store.isDirty()) ESB.toolbar.autosave();
    }, 600);
  }

  function cancelAutosave() {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function closeMobilePanels() {
    var app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('sidebar-open', 'inspector-open');
    if (ESB.toolbar && typeof ESB.toolbar.syncPanels === 'function') {
      ESB.toolbar.syncPanels();
      return;
    }
    var sidebarButton = document.getElementById('btnToggleSidebar');
    var inspectorButton = document.getElementById('btnToggleInspector');
    if (sidebarButton) sidebarButton.setAttribute('aria-expanded', 'false');
    if (inspectorButton) inspectorButton.setAttribute('aria-expanded', 'false');
  }

  function reportError(message) {
    var now = Date.now();
    if (now - lastErrorAt < 1500) return;
    lastErrorAt = now;
    if (ESB.ui && ESB.ui.toast) {
      ESB.ui.toast(message, { type: 'error', duration: 8000 });
    } else {
      console.error(message);
    }
  }

  function boot() {
    if (booted) return;
    booted = true;

    if (!ESB.store || !ESB.canvas || !ESB.elements || !ESB.connections) {
      document.body.innerHTML =
        '<div class="fatal-error"><h1>Event Storm Board could not start</h1>' +
        '<p>One or more application scripts failed to load. Reload the page, and make sure the ' +
        '<code>modules</code> folder sits next to <code>index.html</code>.</p></div>';
      return;
    }

    if (ESB.a11y) ESB.a11y.init();
    if (ESB.theme) ESB.theme.init();

    var restoredFromStorage = false;
    var project = null;

    try {
      project = ESB.projects.loadCurrent();
      restoredFromStorage = Boolean(project);
    } catch (err) {
      reportError('Could not restore the last project: ' + err.message);
    }

    if (!project) project = ESB.model.createProject('Untitled Board');

    ESB.store.init(project);
    ESB.canvas.init();
    ESB.elements.init();
    ESB.connections.init();
    ESB.groups.init();
    ESB.selection.init();
    ESB.minimap.init();
    ESB.palette.init();
    ESB.inspector.init();
    ESB.toolbar.init();
    ESB.shortcuts.init();

    if (!restoredFromStorage) {
      ESB.canvas.restoreViewport({ x: 120, y: 110, zoom: 1 });
    }

    ESB.toolbar.applySettings();
    ESB.elements.sync();
    ESB.connections.sync();
    ESB.groups.sync();
    ESB.inspector.sync();
    ESB.minimap.sync();

    if (restoredFromStorage) {
      ESB.store.markSaved(project.updatedAt || new Date().toISOString());
    }

    ESB.toolbar.sync();
    showEmptyState();

    if (!ESB.projects.available()) {
      ESB.ui.toast('Local storage is blocked in this browser, so autosave is off. Use Export to keep your board.', {
        type: 'error',
        duration: 9000
      });
    }

    ESB.store.onChange(function (reason) {
      ESB.elements.sync();
      ESB.connections.sync();
      ESB.groups.sync();
      ESB.inspector.sync();
      ESB.minimap.sync();
      ESB.toolbar.sync();
      showEmptyState();

      if (reason === 'selection' && ESB.a11y) ESB.a11y.announceSelection();

      if (reason === 'load') {
        ESB.canvas.restoreViewport(ESB.store.getViewport());
        ESB.canvas.syncGrid(ESB.store.getBoard().settings);
        ESB.toolbar.applySettings();
      }

      if (reason === 'change' || reason === 'restore' || reason === 'meta' || reason === 'load') {
        scheduleAutosave();
      }
    });

    ESB.canvas.onViewportChange(function () {
      ESB.minimap.sync();
      if (ESB.toolbar) ESB.toolbar.sync();
    });

    window.addEventListener('beforeunload', function (event) {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      if (!ESB.store.isDirty()) return;
      if (!ESB.projects.available()) {
        /* No autosave possible, so warn before losing in-memory work. */
        event.preventDefault();
        event.returnValue = '';
        return;
      }
      try {
        ESB.projects.save(ESB.store.getProject());
      } catch (err) {
        /* The browser is closing; nothing else can be done. */
      }
    });

    window.addEventListener('error', function (event) {
      if (event && event.message) reportError('Unexpected error: ' + event.message);
    });

    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      reportError('Unexpected error: ' + (reason && reason.message ? reason.message : String(reason)));
    });

    document.getElementById('canvasSurface').focus({ preventScroll: true });
  }

  ESB.app = {
    boot: boot,
    closeMobilePanels: closeMobilePanels,
    cancelAutosave: cancelAutosave
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
