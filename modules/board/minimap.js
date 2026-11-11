/*
 * Event Storm Board — minimap rendering and navigation.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var canvasEl = null;
  var ctx = null;
  var container = null;
  var view = { scale: 1, offsetX: 0, offsetY: 0, bounds: null };
  var size = { width: 200, height: 132 };
  var dragging = false;
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    canvasEl = document.getElementById('minimapCanvas');
    container = document.getElementById('minimap');
    if (!canvasEl) return;
    ctx = canvasEl.getContext('2d');
    resize();

    canvasEl.addEventListener('pointerdown', function (event) {
      dragging = true;
      try { canvasEl.setPointerCapture(event.pointerId); } catch (err) { /* synthetic or unsupported pointer */ }
      navigate(event);
    });
    canvasEl.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      navigate(event);
    });
    canvasEl.addEventListener('pointerup', function () { dragging = false; });
    canvasEl.addEventListener('pointercancel', function () { dragging = false; });

    window.addEventListener('resize', function () { resize(); sync(); });
  }

  function resize() {
    var dpr = global.devicePixelRatio || 1;
    var width = global.innerWidth <= 1120 ? 148 : 200;
    size.width = width;
    size.height = Math.round(width * 0.66);
    canvasEl.width = Math.round(size.width * dpr);
    canvasEl.height = Math.round(size.height * dpr);
    canvasEl.style.width = size.width + 'px';
    canvasEl.style.height = size.height + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function navigate(event) {
    if (!view.bounds) return;
    var rect = canvasEl.getBoundingClientRect();
    var mx = event.clientX - rect.left;
    var my = event.clientY - rect.top;
    var boardX = (mx - view.offsetX) / view.scale + view.bounds.x;
    var boardY = (my - view.offsetY) / view.scale + view.bounds.y;
    ESB.canvas.centerOnBoardPoint(boardX, boardY);
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function roundRect(context, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function sync() {
    if (!ctx || !container) return;
    if (container.classList.contains('is-hidden')) return;

    var elements = ESB.store.getElements();
    var visible = ESB.canvas.getVisibleBoardRect();
    var content = ESB.model.contentBounds(elements);

    var bounds = content ? {
      x: Math.min(content.x, visible.x),
      y: Math.min(content.y, visible.y),
      width: Math.max(content.x + content.width, visible.x + visible.width) - Math.min(content.x, visible.x),
      height: Math.max(content.y + content.height, visible.y + visible.height) - Math.min(content.y, visible.y)
    } : visible;

    var padding = 24;
    var usableWidth = size.width - padding * 2;
    var usableHeight = size.height - padding * 2;
    var scale = Math.min(usableWidth / Math.max(1, bounds.width), usableHeight / Math.max(1, bounds.height));
    scale = Math.max(0.008, Math.min(scale, 0.2));

    view.scale = scale;
    view.bounds = bounds;
    view.offsetX = (size.width - bounds.width * scale) / 2;
    view.offsetY = (size.height - bounds.height * scale) / 2;

    var dark = isDark();
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = dark ? '#0F1622' : '#F4F7FB';
    ctx.fillRect(0, 0, size.width, size.height);

    var selection = new Set(ESB.store.getSelection());

    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ESB.store.getConnections().forEach(function (connection) {
      var from = ESB.store.getElement(connection.from.elementId);
      var to = ESB.store.getElement(connection.to.elementId);
      if (!from || !to) return;
      var typeInfo = ESB.model.CONNECTION_TYPES[connection.type];
      ctx.strokeStyle = typeInfo ? typeInfo.color : '#94A3B8';
      ctx.beginPath();
      ctx.moveTo(
        (from.x + from.width / 2 - bounds.x) * scale + view.offsetX,
        (from.y + from.height / 2 - bounds.y) * scale + view.offsetY
      );
      ctx.lineTo(
        (to.x + to.width / 2 - bounds.x) * scale + view.offsetX,
        (to.y + to.height / 2 - bounds.y) * scale + view.offsetY
      );
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    ESB.model.sortForRender(elements).forEach(function (el) {
      var info = ESB.model.typeInfo(el.type);
      if (!info) return;
      var x = (el.x - bounds.x) * scale + view.offsetX;
      var y = (el.y - bounds.y) * scale + view.offsetY;
      var w = Math.max(2, el.width * scale);
      var h = Math.max(2, el.height * scale);
      var color = el.color || info.color;

      if (el.type === 'boundedContext') {
        ctx.fillStyle = ESB.model.withAlpha(color, 0.4);
        roundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(122, 176, 255, 0.55)' : 'rgba(58, 110, 165, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, w, h, 1.5);
        ctx.fill();
      }

      if (selection.has(el.id)) {
        ctx.strokeStyle = dark ? '#7AB0FF' : '#2F6FED';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x - 0.5, y - 0.5, w + 1, h + 1, 2);
        ctx.stroke();
      }
    });

    var vx = (visible.x - bounds.x) * scale + view.offsetX;
    var vy = (visible.y - bounds.y) * scale + view.offsetY;
    var vw = Math.max(4, visible.width * scale);
    var vh = Math.max(4, visible.height * scale);

    ctx.strokeStyle = dark ? 'rgba(226, 236, 248, 0.8)' : 'rgba(20, 27, 38, 0.65)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, vx, vy, vw, vh, 2);
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(122, 176, 255, 0.12)' : 'rgba(47, 111, 237, 0.08)';
    ctx.fill();
  }

  ESB.minimap = {
    init: init,
    sync: sync,
    resize: resize
  };
})(window);
