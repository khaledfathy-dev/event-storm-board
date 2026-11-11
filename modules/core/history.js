/*
 * Event Storm Board — snapshot undo/redo.
 * Histories are plain data snapshots; nothing here touches the DOM.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});

  function SnapshotHistory(options) {
    var opts = options || {};
    this.limit = opts.limit || 60;
    this.getCurrent = opts.getCurrent || function () { return null; };
    this.onRestore = opts.onRestore || function () {};
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.lastKey = null;
    this.lastAt = 0;
    this.coalesceWindow = opts.coalesceWindow || 700;
  }

  SnapshotHistory.prototype.onChange = function (handler) {
    this.listeners.add(handler);
    var self = this;
    return function () { self.listeners.delete(handler); };
  };

  SnapshotHistory.prototype.emit = function () {
    var self = this;
    this.listeners.forEach(function (handler) {
      try { handler(self); } catch (err) { console.error(err); }
    });
  };

  SnapshotHistory.prototype.record = function (snapshot, label, coalesceKey) {
    if (snapshot == null) return false;
    var now = Date.now();
    if (coalesceKey && this.lastKey === coalesceKey && now - this.lastAt < this.coalesceWindow) {
      this.lastAt = now;
      return false;
    }
    this.undoStack.push({ board: snapshot, label: label || 'Change', at: now });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.lastKey = coalesceKey || null;
    this.lastAt = now;
    this.emit();
    return true;
  };

  SnapshotHistory.prototype.undo = function () {
    if (!this.undoStack.length) return false;
    var entry = this.undoStack.pop();
    this.redoStack.push({ board: this.getCurrent(), label: entry.label, at: Date.now() });
    this.lastKey = null;
    this.onRestore(entry.board);
    this.emit();
    return true;
  };

  SnapshotHistory.prototype.redo = function () {
    if (!this.redoStack.length) return false;
    var entry = this.redoStack.pop();
    this.undoStack.push({ board: entry.board, label: entry.label, at: Date.now() });
    this.lastKey = null;
    this.onRestore(entry.board);
    this.emit();
    return true;
  };

  SnapshotHistory.prototype.canUndo = function () {
    return this.undoStack.length > 0;
  };

  SnapshotHistory.prototype.canRedo = function () {
    return this.redoStack.length > 0;
  };

  SnapshotHistory.prototype.clear = function () {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
    this.emit();
  };

  SnapshotHistory.prototype.lastLabel = function () {
    var entry = this.undoStack[this.undoStack.length - 1];
    return entry ? entry.label : '';
  };

  ESB.SnapshotHistory = SnapshotHistory;
})(window);
