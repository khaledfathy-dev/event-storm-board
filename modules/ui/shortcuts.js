/*
 * Event Storm Board — keyboard shortcuts.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var initialized = false;

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      target.isContentEditable === true ||
      Boolean(target.closest && target.closest('[contenteditable="true"]'));
  }

  function modalOpen() {
    var root = document.getElementById('modalRoot');
    return Boolean(root && root.children.length);
  }

  /*
   * Board-only shortcuts (Delete, F2, arrows, G/M/F) must not fire while the
   * user is working in the toolbar, palette, Properties panel or Help dialog.
   * Modified shortcuts stay global so Save/Undo work from anywhere.
   */
  function isBoardContext(event) {
    var target = event.target;
    if (!target) return true;
    if (target === document.body || target === document.documentElement) return true;
    if (typeof target.closest !== 'function') return false;
    return Boolean(
      target.closest('.canvas-shell') ||
      target.closest('.canvas-surface') ||
      target.closest('.element') ||
      target.closest('.connection') ||
      target.closest('.group-outline__label') ||
      target.closest('#elementsLayer') ||
      target.closest('#groupsLayer') ||
      target.closest('#connectionsLayer')
    );
  }

  function openHelp(event) {
    if (event) event.preventDefault();
    if (ESB.a11y && ESB.a11y.openHelp) ESB.a11y.openHelp();
  }

  function nudge(dx, dy) {
    var ids = ESB.store.getSelection();
    if (!ids.length) return;
    var positions = ids.map(function (id) {
      var el = ESB.store.getElement(id);
      return { id: id, x: el.x + dx, y: el.y + dy };
    });
    ESB.store.moveElements(positions, null, { coalesce: 'nudge' });
  }

  function onKeyDown(event) {
    if (modalOpen()) return;

    var mod = event.ctrlKey || event.metaKey;
    var key = event.key;

    if (key === 'F1') {
      openHelp(event);
      return;
    }

    if (isTyping(event)) return;

    if (key === '?') {
      openHelp(event);
      return;
    }

    if (mod && !event.shiftKey) {
      if (key === 'z' || key === 'Z') {
        event.preventDefault();
        if (ESB.store.undo()) ESB.toolbar.sync();
        return;
      }
      if (key === 'y' || key === 'Y') {
        event.preventDefault();
        if (ESB.store.redo()) ESB.toolbar.sync();
        return;
      }
    }

    if (mod && event.shiftKey && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      if (ESB.store.redo()) ESB.toolbar.sync();
      return;
    }

    if (mod && (key === 's' || key === 'S')) {
      event.preventDefault();
      ESB.toolbar.save();
      return;
    }

    if (mod && (key === 'd' || key === 'D')) {
      event.preventDefault();
      ESB.store.duplicateElements(ESB.store.getSelection());
      return;
    }

    if (mod && (key === 'a' || key === 'A')) {
      event.preventDefault();
      ESB.store.selectAll();
      return;
    }

    if (mod && event.shiftKey && (key === 'g' || key === 'G')) {
      event.preventDefault();
      ESB.store.ungroupElements(ESB.store.getSelection());
      return;
    }

    if (mod && (key === 'g' || key === 'G')) {
      event.preventDefault();
      ESB.store.groupElements(ESB.store.getSelection());
      return;
    }

    if (mod && (key === '0')) {
      event.preventDefault();
      ESB.canvas.fitToContent();
      return;
    }

    if (mod && (key === '+' || key === '=')) {
      event.preventDefault();
      ESB.canvas.zoomIn();
      return;
    }

    if (mod && key === '-') {
      event.preventDefault();
      ESB.canvas.zoomOut();
      return;
    }

    if (key === 'Escape') {
      ESB.store.clearSelection();
      ESB.app && ESB.app.closeMobilePanels && ESB.app.closeMobilePanels();
      return;
    }

    if (!isBoardContext(event)) return;

    if (!mod && (key === 'g' || key === 'G')) {
      event.preventDefault();
      document.getElementById('btnGrid').click();
      return;
    }

    if (!mod && (key === 'm' || key === 'M')) {
      event.preventDefault();
      document.getElementById('btnMinimap').click();
      return;
    }

    if (!mod && (key === 'f' || key === 'F')) {
      event.preventDefault();
      document.getElementById('btnFullscreen').click();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      var connectionId = ESB.store.getSelectedConnectionId();
      if (connectionId) {
        event.preventDefault();
        ESB.store.removeConnection(connectionId);
        return;
      }
      var ids = ESB.store.getSelection();
      if (!ids.length) return;
      event.preventDefault();
      ESB.store.removeElements(ids);
      return;
    }

    if (key === 'F2') {
      var selection = ESB.store.getSelection();
      if (selection.length === 1) {
        event.preventDefault();
        ESB.elements.startTitleEdit(selection[0]);
      }
      return;
    }

    if (key === '+' || key === '=') {
      event.preventDefault();
      ESB.canvas.zoomIn();
      return;
    }

    if (key === '-' || key === '_') {
      event.preventDefault();
      ESB.canvas.zoomOut();
      return;
    }

    if (key.indexOf('Arrow') === 0) {
      var step = event.shiftKey ? 10 : 1;
      var dx = 0;
      var dy = 0;
      if (key === 'ArrowLeft') dx = -step;
      if (key === 'ArrowRight') dx = step;
      if (key === 'ArrowUp') dy = -step;
      if (key === 'ArrowDown') dy = step;
      if (!dx && !dy) return;
      event.preventDefault();
      nudge(dx, dy);
      return;
    }

    if (key === 'Home') {
      event.preventDefault();
      ESB.canvas.fitToContent();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('keydown', onKeyDown);
  }

  ESB.shortcuts = {
    init: init
  };
})(window);
