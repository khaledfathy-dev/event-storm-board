/*
 * Event Storm Board — SVG connection overlay.
 * Renders model connections as curved arrows, creates links by dragging from
 * element edge ports, and edits labels inline.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;
  var NS = 'http://www.w3.org/2000/svg';

  var layer = null;
  var root = null;
  var tempPath = null;
  var drawSession = null;
  var labelEditor = null;
  var initialized = false;

  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null) return;
        node.setAttribute(key, String(attrs[key]));
      });
    }
    return node;
  }

  function arrowMarker(id, color) {
    var marker = svg('marker', {
      id: id,
      viewBox: '0 0 10 10',
      refX: 9.1,
      refY: 5,
      markerWidth: 10,
      markerHeight: 10,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto'
    });
    marker.appendChild(svg('path', {
      d: 'M0.6 0.8 L9.4 5 L0.6 9.2 z',
      fill: color
    }));
    return marker;
  }

  function buildDefs() {
    var defs = svg('defs');
    Object.keys(model.CONNECTION_TYPES).forEach(function (type) {
      defs.appendChild(arrowMarker('esb-arrow-' + type, model.CONNECTION_TYPES[type].color));
    });
    defs.appendChild(arrowMarker('esb-arrow-selected', 'var(--accent)'));
    layer.appendChild(defs);
  }

  function centerOf(element) {
    return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  }

  function autoSide(element, other) {
    var a = centerOf(element);
    var b = centerOf(other);
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var gapX = Math.max(other.x - (element.x + element.width), element.x - (other.x + other.width));
    var gapY = Math.max(other.y - (element.y + element.height), element.y - (other.y + other.height));

    if (gapX > gapY) return dx >= 0 ? 'right' : 'left';
    if (gapY > gapX) return dy >= 0 ? 'bottom' : 'top';
    return Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? 'right' : 'left')
      : (dy >= 0 ? 'bottom' : 'top');
  }

  function anchor(element, side, other) {
    var resolved = side;
    if (!resolved || resolved === 'auto') {
      resolved = other ? autoSide(element, other) : 'right';
    }
    switch (resolved) {
      case 'top':
        return { x: element.x + element.width / 2, y: element.y, dx: 0, dy: -1, side: resolved };
      case 'bottom':
        return { x: element.x + element.width / 2, y: element.y + element.height, dx: 0, dy: 1, side: resolved };
      case 'left':
        return { x: element.x, y: element.y + element.height / 2, dx: -1, dy: 0, side: resolved };
      default:
        return { x: element.x + element.width, y: element.y + element.height / 2, dx: 1, dy: 0, side: 'right' };
    }
  }

  function curveFor(from, to) {
    var distance = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
    var offset = Math.max(26, Math.min(130, distance * 0.42));
    var c1 = { x: from.x + from.dx * offset, y: from.y + from.dy * offset };
    var c2 = { x: to.x + to.dx * offset, y: to.y + to.dy * offset };
    return {
      d: 'M' + from.x + ' ' + from.y +
        ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + to.x + ' ' + to.y,
      from: from,
      to: to,
      c1: c1,
      c2: c2
    };
  }

  function midPoint(curve) {
    var t = 0.5;
    var mt = 1 - t;
    var x = mt * mt * mt * curve.from.x + 3 * mt * mt * t * curve.c1.x +
      3 * mt * t * t * curve.c2.x + t * t * t * curve.to.x;
    var y = mt * mt * mt * curve.from.y + 3 * mt * mt * t * curve.c1.y +
      3 * mt * t * t * curve.c2.y + t * t * t * curve.to.y;

    var tangentX = 3 * mt * mt * (curve.c1.x - curve.from.x) +
      6 * mt * t * (curve.c2.x - curve.c1.x) +
      3 * t * t * (curve.to.x - curve.c2.x);
    var tangentY = 3 * mt * mt * (curve.c1.y - curve.from.y) +
      6 * mt * t * (curve.c2.y - curve.c1.y) +
      3 * t * t * (curve.to.y - curve.c2.y);
    var length = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
    var nx = tangentY / length;
    var ny = -tangentX / length;

    return {
      x: x + nx * 13,
      y: y + ny * 13
    };
  }

  function geometryFor(connection) {
    var fromElement = ESB.store.getElement(connection.from.elementId);
    var toElement = ESB.store.getElement(connection.to.elementId);
    if (!fromElement || !toElement) return null;
    var from = anchor(fromElement, connection.from.side, toElement);
    var to = anchor(toElement, connection.to.side, fromElement);
    var curve = curveFor(from, to);
    curve.mid = midPoint(curve);
    curve.fromElement = fromElement;
    curve.toElement = toElement;
    return curve;
  }

  function renderConnection(connection) {
    var geom = geometryFor(connection);
    if (!geom) return;

    var selected = ESB.store.getSelectedConnectionId() === connection.id;
    var typeInfo = model.CONNECTION_TYPES[connection.type] || model.CONNECTION_TYPES.flow;
    var style = model.CONNECTION_STYLES[connection.style] ? connection.style : typeInfo.style;
    var color = selected ? 'var(--accent)' : typeInfo.color;
    var fromTitle = geom.fromElement.title || 'Untitled';
    var toTitle = geom.toElement.title || 'Untitled';

    var group = svg('g', {
      'class': 'connection' + (selected ? ' is-selected' : ''),
      'data-connection-id': connection.id,
      tabindex: '0',
      role: 'button',
      focusable: 'true',
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': typeInfo.label + (connection.label ? ' "' + connection.label + '"' : '') +
        ' from ' + fromTitle + ' to ' + toTitle
    });

    var hit = svg('path', {
      'class': 'connection__hit',
      d: geom.d
    });
    group.appendChild(hit);

    var line = svg('path', {
      'class': 'connection__line connection__line--' + style,
      d: geom.d,
      stroke: color,
      'marker-end': 'url(#esb-arrow-' + (selected ? 'selected' : (model.CONNECTION_TYPES[connection.type] ? connection.type : 'flow')) + ')'
    });
    if (style === 'dashed') line.setAttribute('stroke-dasharray', '7 6');
    group.appendChild(line);

    var tooltip = svg('title');
    tooltip.textContent = typeInfo.label + ': ' +
      (geom.fromElement.title || 'Untitled') + ' → ' + (geom.toElement.title || 'Untitled');
    group.appendChild(tooltip);

    root.appendChild(group);

    if (!connection.label) return;
    if (ESB.store.getBoard().settings.showConnectionLabels === false) return;

    var text = svg('text', {
      'class': 'connection__label',
      x: geom.mid.x,
      y: geom.mid.y + 4,
      'text-anchor': 'middle'
    });
    text.textContent = connection.label;
    group.appendChild(text);

    var width = 0;
    try { width = text.getComputedTextLength(); } catch (err) { width = 0; }
    if (!width) width = connection.label.length * 6.2;

    var background = svg('rect', {
      'class': 'connection__label-bg',
      x: geom.mid.x - width / 2 - 6,
      y: geom.mid.y - 9,
      width: width + 12,
      height: 18,
      rx: 5
    });
    group.insertBefore(background, text);
  }

  function clearTemp() {
    if (tempPath && tempPath.parentNode) tempPath.parentNode.removeChild(tempPath);
    tempPath = null;
  }

  function focusConnection(id) {
    if (!root || !id) return;
    var node = root.querySelector('[data-connection-id="' + id + '"]');
    if (node && typeof node.focus === 'function') {
      try { node.focus({ preventScroll: true }); } catch (err) { node.focus(); }
    }
  }

  function sync() {
    if (!root || labelEditor) return;
    var focused = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('.connection')
      : null;
    var focusedId = focused ? focused.getAttribute('data-connection-id') : null;

    while (root.firstChild) root.removeChild(root.firstChild);
    ESB.store.getConnections().forEach(function (connection) {
      renderConnection(connection);
    });

    if (!focusedId) return;
    var replacement = root.querySelector('[data-connection-id="' + focusedId + '"]');
    if (replacement) {
      try { replacement.focus({ preventScroll: true }); } catch (err) { replacement.focus(); }
      return;
    }
    var surface = document.getElementById('canvasSurface');
    if (surface) surface.focus({ preventScroll: true });
  }

  function targetAt(point, sourceId) {
    var matches = ESB.store.getElements().filter(function (element) {
      if (element.id === sourceId) return false;
      return point.x >= element.x && point.x <= element.x + element.width &&
        point.y >= element.y && point.y <= element.y + element.height;
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      var ac = a.type === 'boundedContext' ? 1 : 0;
      var bc = b.type === 'boundedContext' ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return (Number(b.z) || 0) - (Number(a.z) || 0);
    });
    return matches[0];
  }

  function highlightTarget(element) {
    if (!drawSession) return;
    if (drawSession.targetId === (element ? element.id : null)) return;
    if (drawSession.targetId) {
      var previous = ESB.elements.getNode(drawSession.targetId);
      if (previous) previous.classList.remove('is-connect-target');
    }
    drawSession.targetId = element ? element.id : null;
    if (element) {
      var node = ESB.elements.getNode(element.id);
      if (node) node.classList.add('is-connect-target');
    }
  }

  function updateDraw(clientX, clientY) {
    if (!drawSession) return;
    var sourceElement = ESB.store.getElement(drawSession.sourceId);
    if (!sourceElement) {
      finishDraw();
      return;
    }
    var point = ESB.canvas.screenToBoard(clientX, clientY);
    var target = targetAt(point, drawSession.sourceId);
    highlightTarget(target);

    var source = anchor(sourceElement, drawSession.side, target || null);
    var end = { x: point.x, y: point.y };
    if (target) {
      end = anchor(target, 'auto', sourceElement);
    }
    tempPath.setAttribute('d', 'M' + source.x + ' ' + source.y + ' L' + end.x + ' ' + end.y);
  }

  function startDraw(event, element, side) {
    finishDraw();
    drawSession = {
      pointerId: event.pointerId,
      sourceId: element.id,
      side: side,
      targetId: null
    };
    ESB.store.select([element.id]);
    tempPath = svg('path', { 'class': 'connection__temp' });
    layer.appendChild(tempPath);
    document.body.classList.add('is-connecting');
    document.addEventListener('pointermove', onDrawMove);
    document.addEventListener('pointerup', onDrawEnd);
    document.addEventListener('pointercancel', onDrawCancel);
    updateDraw(event.clientX, event.clientY);
  }

  function startDrawFromPort(event, element, side) {
    if (!element) return;
    startDraw(event, element, side || 'auto');
  }

  function onDrawMove(event) {
    if (!drawSession || event.pointerId !== drawSession.pointerId) return;
    event.preventDefault();
    updateDraw(event.clientX, event.clientY);
  }

  function onDrawEnd(event) {
    if (!drawSession || (event && event.pointerId !== drawSession.pointerId)) return;
    var targetId = drawSession.targetId;
    var sourceId = drawSession.sourceId;
    var side = drawSession.side;
    finishDraw();
    if (targetId) {
      ESB.store.addConnection({
        from: { elementId: sourceId, side: side },
        to: { elementId: targetId, side: 'auto' }
      });
    }
  }

  function onDrawCancel(event) {
    if (!drawSession || (event && event.pointerId !== drawSession.pointerId)) return;
    finishDraw();
  }

  function finishDraw() {
    if (!drawSession) return;
    if (drawSession.targetId) {
      var node = ESB.elements.getNode(drawSession.targetId);
      if (node) node.classList.remove('is-connect-target');
    }
    drawSession = null;
    clearTemp();
    document.body.classList.remove('is-connecting');
    document.removeEventListener('pointermove', onDrawMove);
    document.removeEventListener('pointerup', onDrawEnd);
    document.removeEventListener('pointercancel', onDrawCancel);
  }

  function startLabelEdit(id) {
    var connection = ESB.store.getConnection(id);
    if (!connection) return;
    var geom = geometryFor(connection);
    if (!geom) return;
    if (labelEditor) endLabelEdit(true, false);

    ESB.store.selectConnection(id);

    var foreign = svg('foreignObject', {
      'class': 'connection-label-editor',
      x: geom.mid.x - 100,
      y: geom.mid.y - 17,
      width: 200,
      height: 34
    });
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'connection-label-input';
    input.value = connection.label || '';
    input.placeholder = 'Connection label';
    input.maxLength = 200;
    input.setAttribute('aria-label', 'Connection label');
    foreign.appendChild(input);
    layer.appendChild(foreign);

    labelEditor = { id: id, foreign: foreign, input: input };
    input.focus();
    input.select();

    input.addEventListener('keydown', function (event) {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        endLabelEdit(true, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        endLabelEdit(false, true);
      }
    });
    input.addEventListener('blur', function () {
      endLabelEdit(true, false);
    });
  }

  function endLabelEdit(commit, restoreFocus) {
    if (!labelEditor) return;
    var editor = labelEditor;
    labelEditor = null;
    var value = (editor.input.value || '').trim();
    if (editor.foreign.parentNode) editor.foreign.parentNode.removeChild(editor.foreign);

    var connection = ESB.store.getConnection(editor.id);
    if (commit && connection && connection.label !== value) {
      ESB.store.updateConnection(editor.id, { label: value }, { label: 'Edit connection label' });
    } else {
      sync();
    }

    if (restoreFocus) {
      setTimeout(function () { focusConnection(editor.id); }, 0);
    }
  }

  function onLayerPointerDown(event) {
    if (event.button !== 0) return;
    if (ESB.canvas.isSpaceDown()) return;
    if (!event.target.closest) return;

    var port = event.target.closest('.element__port');
    if (port) {
      var elementNode = port.closest('.element');
      var element = elementNode ? ESB.store.getElement(elementNode.dataset.id) : null;
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      startDraw(event, element, port.dataset.side);
      return;
    }

    var group = event.target.closest('.connection');
    if (group) {
      event.preventDefault();
      event.stopPropagation();
      var connectionId = group.getAttribute('data-connection-id');
      ESB.store.selectConnection(connectionId);
      focusConnection(connectionId);
    }
  }

  function onLayerDoubleClick(event) {
    if (!event.target.closest) return;
    var group = event.target.closest('.connection');
    if (!group) return;
    event.preventDefault();
    startLabelEdit(group.dataset.connectionId);
  }

  function onLayerKeyDown(event) {
    var group = event.target.closest ? event.target.closest('.connection') : null;
    if (!group || event.target !== group) return;
    var id = group.getAttribute('data-connection-id');
    if (!id) return;

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      event.stopPropagation();
      ESB.store.selectConnection(id);
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      ESB.store.selectConnection(id);
      startLabelEdit(id);
    }
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (drawSession) {
      event.stopPropagation();
      finishDraw();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    layer = document.getElementById('connectionsLayer');
    if (!layer) return;

    buildDefs();
    root = svg('g', { 'class': 'connections' });
    layer.appendChild(root);

    layer.addEventListener('pointerdown', onLayerPointerDown);
    layer.addEventListener('dblclick', onLayerDoubleClick);
    layer.addEventListener('keydown', onLayerKeyDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', function () { sync(); });
  }

  ESB.connections = {
    init: init,
    sync: sync,
    startDrawFromPort: startDrawFromPort,
    startLabelEdit: startLabelEdit,
    finishDraw: finishDraw,
    geometryFor: geometryFor,
    getLabelEditor: function () { return labelEditor; }
  };
})(window);
