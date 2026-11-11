/*
 * Event Storm Board — marquee selection on empty canvas.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var surface = null;
  var marquee = null;
  var session = null;
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    surface = document.getElementById('canvasSurface');
    marquee = document.getElementById('marquee');

    surface.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') cancel();
    });
  }

  function cancel() {
    if (!session) return;
    detach();
    marquee.hidden = true;
    marquee.style.width = '0px';
    marquee.style.height = '0px';
    session = null;
  }

  function detach() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (ESB.canvas.isSpaceDown()) return;
    if (event.target.closest && event.target.closest('.element')) return;
    if (event.target.closest && event.target.closest('.minimap')) return;

    var point = ESB.canvas.surfacePoint(event.clientX, event.clientY);
    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false
    };
    detach();
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    var dx = event.clientX - session.startX;
    var dy = event.clientY - session.startY;

    if (!session.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      session.moved = true;
      marquee.hidden = false;
      marquee.classList.add('is-active');
    }

    var point = ESB.canvas.surfacePoint(event.clientX, event.clientY);
    var left = Math.min(session.originX, point.x);
    var top = Math.min(session.originY, point.y);
    var width = Math.abs(point.x - session.originX);
    var height = Math.abs(point.y - session.originY);

    marquee.style.left = left + 'px';
    marquee.style.top = top + 'px';
    marquee.style.width = width + 'px';
    marquee.style.height = height + 'px';

    var boardA = ESB.canvas.screenToBoard(session.startX, session.startY);
    var boardB = ESB.canvas.screenToBoard(event.clientX, event.clientY);
    var rect = {
      left: Math.min(boardA.x, boardB.x),
      top: Math.min(boardA.y, boardB.y),
      right: Math.max(boardA.x, boardB.x),
      bottom: Math.max(boardA.y, boardB.y)
    };

    var hits = [];
    var seen = Object.create(null);

    function addHit(id) {
      if (seen[id]) return;
      seen[id] = true;
      hits.push(id);
    }

    ESB.store.getElements().forEach(function (el) {
      var intersects = !(el.x > rect.right || el.x + el.width < rect.left ||
        el.y > rect.bottom || el.y + el.height < rect.top);
      if (!intersects) return;
      addHit(el.id);
      if (el.groupId) ESB.store.getGroupMemberIds(el.groupId).forEach(addHit);
    });

    ESB.store.select(hits, { additive: session.additive });
  }

  function onPointerUp(event) {
    if (!session) return;
    if (event && event.pointerId !== session.pointerId) return;
    var wasMoved = session.moved;
    var additive = session.additive;
    cancel();
    if (!wasMoved && !additive) {
      ESB.store.clearSelection();
    }
  }

  ESB.selection = {
    init: init,
    cancel: cancel
  };
})(window);
