/*
 * Event Storm Board — viewport: pan, zoom, grid, coordinate conversion.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var MIN_ZOOM = 0.2;
  var MAX_ZOOM = 2.5;

  var shell = null;
  var surface = null;
  var layer = null;
  var listeners = new Set();

  var pan = { x: 60, y: 60 };
  var zoom = 1;
  var spaceDown = false;
  var panSession = null;
  var initialized = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function apply() {
    if (!layer) return;
    layer.style.transform = 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')';
    var settings = ESB.store ? ESB.store.getBoard().settings : { gridSize: 8 };
    var gridSize = Math.max(4, Number(settings.gridSize) || 8);
    surface.style.setProperty('--grid-size', (gridSize * zoom) + 'px');
    surface.style.setProperty('--grid-x', pan.x + 'px');
    surface.style.setProperty('--grid-y', pan.y + 'px');
    surface.style.setProperty('--grid-opacity', zoom < 0.45 ? '0.35' : '1');
    if (ESB.store) {
      ESB.store.setViewport({ x: pan.x, y: pan.y, zoom: zoom });
    }
    listeners.forEach(function (handler) {
      try { handler(getViewport()); } catch (err) { console.error(err); }
    });
  }

  function getViewport() {
    return { x: pan.x, y: pan.y, zoom: zoom };
  }

  function restoreViewport(viewport) {
    if (!viewport) return;
    pan = { x: Number(viewport.x) || 0, y: Number(viewport.y) || 0 };
    zoom = clamp(Number(viewport.zoom) || 1, MIN_ZOOM, MAX_ZOOM);
    apply();
  }

  function screenToBoard(clientX, clientY) {
    var rect = surface.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    };
  }

  function boardToScreen(x, y) {
    var rect = surface.getBoundingClientRect();
    return {
      x: x * zoom + pan.x + rect.left,
      y: y * zoom + pan.y + rect.top
    };
  }

  function surfacePoint(clientX, clientY) {
    var rect = surface.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function getVisibleBoardRect() {
    var rect = surface.getBoundingClientRect();
    return {
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      width: rect.width / zoom,
      height: rect.height / zoom
    };
  }

  function zoomTo(nextZoom, anchorClientX, anchorClientY) {
    var target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(target - zoom) < 0.0001) return;
    var rect = surface.getBoundingClientRect();
    var ax = (anchorClientX == null ? rect.width / 2 : anchorClientX - rect.left);
    var ay = (anchorClientY == null ? rect.height / 2 : anchorClientY - rect.top);
    var boardX = (ax - pan.x) / zoom;
    var boardY = (ay - pan.y) / zoom;
    zoom = target;
    pan.x = ax - boardX * zoom;
    pan.y = ay - boardY * zoom;
    apply();
  }

  function zoomIn() { zoomTo(zoom * 1.2); }
  function zoomOut() { zoomTo(zoom / 1.2); }

  function resetZoom() {
    zoomTo(1);
  }

  function fitToContent() {
    var bounds = ESB.model.contentBounds(ESB.store.getElements());
    var rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var padding = 72;

    if (!bounds) {
      zoom = 1;
      pan.x = Math.max(48, rect.width / 2 - 260);
      pan.y = Math.max(48, rect.height / 2 - 180);
      apply();
      return;
    }

    var scale = Math.min(
      (rect.width - padding * 2) / bounds.width,
      (rect.height - padding * 2) / bounds.height
    );
    scale = clamp(scale, MIN_ZOOM, 1.25);
    zoom = scale;
    pan.x = (rect.width - bounds.width * zoom) / 2 - bounds.x * zoom;
    pan.y = (rect.height - bounds.height * zoom) / 2 - bounds.y * zoom;
    apply();
  }

  function centerOnBoardPoint(x, y) {
    var rect = surface.getBoundingClientRect();
    pan.x = rect.width / 2 - x * zoom;
    pan.y = rect.height / 2 - y * zoom;
    apply();
  }

  function goToElement(id) {
    var element = ESB.store.getElement(id);
    if (!element) return;
    centerOnBoardPoint(element.x + element.width / 2, element.y + element.height / 2);
  }

  function syncGrid(settings) {
    surface.classList.toggle('canvas-surface--no-grid', !settings.grid);
    apply();
  }

  function setSpaceDown(value) {
    if (spaceDown === value) return;
    spaceDown = value;
    surface.classList.toggle('is-pan-ready', value);
  }

  function isSpaceDown() {
    return spaceDown;
  }

  function onWheel(event) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      var factor = Math.exp(-event.deltaY * 0.0022);
      zoomTo(zoom * factor, event.clientX, event.clientY);
      return;
    }
    event.preventDefault();
    pan.x -= event.deltaX;
    pan.y -= event.deltaY;
    apply();
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target === surface && event.button === 0) {
      try { surface.focus({ preventScroll: true }); } catch (err) { surface.focus(); }
    }
    var wantsPan = event.button === 1 || (spaceDown && event.button === 0);
    if (!wantsPan) return;
    event.preventDefault();
    panSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y
    };
    surface.classList.add('is-panning');
    try { surface.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
  }

  function onPointerMove(event) {
    if (!panSession || event.pointerId !== panSession.pointerId) return;
    pan.x = panSession.originX + (event.clientX - panSession.startX);
    pan.y = panSession.originY + (event.clientY - panSession.startY);
    apply();
  }

  function endPan(event) {
    if (!panSession) return;
    if (event && event.pointerId !== panSession.pointerId) return;
    panSession = null;
    surface.classList.remove('is-panning');
    apply();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    shell = document.getElementById('canvasShell');
    surface = document.getElementById('canvasSurface');
    layer = document.getElementById('boardLayer');

    surface.addEventListener('wheel', onWheel, { passive: false });
    surface.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', endPan);
    document.addEventListener('pointercancel', endPan);
    surface.addEventListener('contextmenu', function (event) { event.preventDefault(); });

    document.addEventListener('keydown', function (event) {
      if (event.code !== 'Space') return;
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (target && target.isContentEditable);
      var interactive = tag === 'button' || tag === 'a' || (target && target.getAttribute && target.getAttribute('role') === 'button');
      if (typing || interactive) return;
      event.preventDefault();
      setSpaceDown(true);
    });

    document.addEventListener('keyup', function (event) {
      if (event.code !== 'Space') return;
      setSpaceDown(false);
    });

    window.addEventListener('blur', function () {
      setSpaceDown(false);
      endPan(null);
    });

    var resizeObserver = new ResizeObserver(function () { apply(); });
    resizeObserver.observe(surface);

    restoreViewport(ESB.store.getViewport());
  }

  function onViewportChange(handler) {
    listeners.add(handler);
    return function () { listeners.delete(handler); };
  }

  ESB.canvas = {
    init: init,
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
    apply: apply,
    getViewport: getViewport,
    restoreViewport: restoreViewport,
    screenToBoard: screenToBoard,
    boardToScreen: boardToScreen,
    surfacePoint: surfacePoint,
    getVisibleBoardRect: getVisibleBoardRect,
    zoomTo: zoomTo,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    resetZoom: resetZoom,
    fitToContent: fitToContent,
    centerOnBoardPoint: centerOnBoardPoint,
    goToElement: goToElement,
    syncGrid: syncGrid,
    isSpaceDown: isSpaceDown,
    onViewportChange: onViewportChange,
    getZoom: function () { return zoom; },
    getSurface: function () { return surface; }
  };
})(window);
