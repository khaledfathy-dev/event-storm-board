/*
 * Event Storm Board — element rendering and direct manipulation.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;

  var nodes = new Map();
  var layer = null;
  var dragSession = null;
  var resizeSession = null;
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    layer = document.getElementById('elementsLayer');
    layer.addEventListener('pointerdown', onPointerDown);
    layer.addEventListener('dblclick', onDoubleClick);
    layer.addEventListener('keydown', onKeyDown);
  }

  function createNode(element) {
    var node = document.createElement('div');
    node.className = 'element';
    node.dataset.id = element.id;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-pressed', 'false');

    var typeEl = document.createElement('div');
    typeEl.className = 'element__type';
    node.appendChild(typeEl);

    var titleEl = document.createElement('div');
    titleEl.className = 'element__title';
    node.appendChild(titleEl);

    var descEl = document.createElement('div');
    descEl.className = 'element__desc';
    node.appendChild(descEl);

    var ports = document.createElement('div');
    ports.className = 'element__ports';
    ports.setAttribute('aria-hidden', 'true');
    model.CONNECTION_SIDES.forEach(function (side) {
      if (side === 'auto') return;
      var port = document.createElement('button');
      port.type = 'button';
      port.className = 'element__port element__port--' + side;
      port.dataset.side = side;
      port.tabIndex = -1;
      port.setAttribute('aria-label', 'Drag to connect from the ' + side + ' side');
      ports.appendChild(port);
    });
    node.appendChild(ports);

    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'element__resize';
    handle.setAttribute('aria-label', 'Resize element');
    handle.tabIndex = -1;
    node.appendChild(handle);

    return node;
  }

  function updateNode(node, element) {
    var info = model.typeInfo(element.type);
    if (!info) return;
    var selected = ESB.store.isSelected(element.id);
    node.className = 'element element--' + element.type +
      (info.container ? ' element--container' : '') +
      (selected ? ' is-selected' : '');

    node.style.left = element.x + 'px';
    node.style.top = element.y + 'px';
    node.style.width = element.width + 'px';
    node.style.height = element.height + 'px';
    node.style.zIndex = String(info.container ? 1 : 10 + (Number(element.z) || 1));

    var background = element.color || info.color;
    node.style.setProperty('--el-bg', background);
    node.style.setProperty('--el-ink', model.contrastInk(background));
    node.style.setProperty('--el-line', model.withAlpha(model.contrastInk(background), 0.16));

    node.setAttribute('aria-label', info.label + ': ' + (element.title || 'Untitled'));
    node.setAttribute('aria-pressed', String(selected));
    if (info.container) node.setAttribute('aria-roledescription', 'bounded context container');

    var typeEl = node.querySelector('.element__type');
    if (typeEl.textContent !== info.label) typeEl.textContent = info.label;

    if (node.dataset.editing !== '1') {
      var titleEl = node.querySelector('.element__title');
      if (titleEl.textContent !== element.title) titleEl.textContent = element.title;
    }

    var descEl = node.querySelector('.element__desc');
    var description = element.description || '';
    if (descEl.textContent !== description) descEl.textContent = description;
    descEl.hidden = !description;
  }

  function sync() {
    if (!layer) return;
    var elements = model.sortForRender(ESB.store.getElements());
    var seen = Object.create(null);
    var focusLost = false;

    elements.forEach(function (element) {
      seen[element.id] = true;
      var node = nodes.get(element.id);
      if (!node) {
        node = createNode(element);
        nodes.set(element.id, node);
        layer.appendChild(node);
      }
      updateNode(node, element);
    });

    nodes.forEach(function (node, id) {
      if (!seen[id]) {
        if (node.contains(document.activeElement)) focusLost = true;
        node.remove();
        nodes.delete(id);
      }
    });

    if (focusLost) {
      var surface = document.getElementById('canvasSurface');
      if (surface) surface.focus({ preventScroll: true });
    }
  }

  function getNode(id) {
    return nodes.get(id) || null;
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function snapValue(value, settings) {
    if (!settings.snap) return Math.round(value);
    var grid = Math.max(4, Number(settings.gridSize) || 8);
    return Math.round(value / grid) * grid;
  }

  function syncConnections() {
    if (ESB.connections) ESB.connections.sync();
  }

  function syncOverlays() {
    syncConnections();
    if (ESB.groups) ESB.groups.sync();
  }

  function readPx(value, fallback) {
    var number = parseFloat(value);
    return isFinite(number) ? number : fallback;
  }

  function getLiveBox(id) {
    var element = ESB.store.getElement(id);
    if (!element) return null;
    var node = nodes.get(id);
    if (!node) {
      return { x: element.x, y: element.y, width: element.width, height: element.height };
    }
    return {
      x: readPx(node.style.left, element.x),
      y: readPx(node.style.top, element.y),
      width: readPx(node.style.width, element.width),
      height: readPx(node.style.height, element.height)
    };
  }

  function selectionFor(element, single) {
    if (!single && element.groupId) {
      var ids = ESB.store.getGroupMemberIds(element.groupId);
      if (ids.length > 1) return ids;
    }
    return [element.id];
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    var node = event.target.closest ? event.target.closest('.element') : null;
    if (!node) return;
    if (event.target.isContentEditable || event.target.closest('[contenteditable="true"]')) return;

    var id = node.dataset.id;
    var element = ESB.store.getElement(id);
    if (!element) return;

    if (ESB.canvas.isSpaceDown()) return;

    var port = event.target.closest ? event.target.closest('.element__port') : null;
    if (port) {
      event.preventDefault();
      event.stopPropagation();
      if (ESB.connections) ESB.connections.startDrawFromPort(event, element, port.dataset.side);
      return;
    }

    var additive = event.shiftKey || event.ctrlKey || event.metaKey;
    var single = Boolean(event.altKey);
    var resizeHandle = event.target.closest('.element__resize');
    var onContainerHeader = event.target.closest('.element__title, .element__type');

    /* A bounded context is moved by its header; its interior stays free for the board. */
    if (element.type === 'boundedContext' && !onContainerHeader && !resizeHandle) {
      ESB.store.clearSelection();
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    if (additive && !resizeHandle) {
      ESB.store.toggleElements(selectionFor(element, single));
      return;
    }

    if (!ESB.store.isSelected(id)) {
      ESB.store.select(selectionFor(element, single));
    } else if (single && ESB.store.getSelection().length > 1) {
      /* Alt-click narrows a multi/group selection to one member. */
      ESB.store.select([id]);
    } else if (!single && element.groupId && ESB.store.getSelection().length === 1) {
      /* A second normal click on an isolated member re-expands to the group. */
      ESB.store.select(selectionFor(element, false));
    }

    try { node.focus({ preventScroll: true }); } catch (err) { /* older browsers */ }

    if (resizeHandle) startResize(event, element, node);
    else startMove(event, element);
  }

  function startMove(event, element) {
    var ids = ESB.store.getSelection();
    if (ids.indexOf(element.id) < 0) ids = [element.id];

    var elements = ESB.store.getElements();
    var moving = ids.slice();

    if (element.type === 'boundedContext') {
      var left = element.x;
      var top = element.y;
      var right = element.x + element.width;
      var bottom = element.y + element.height;
      elements.forEach(function (other) {
        if (other.type === 'boundedContext') return;
        if (moving.indexOf(other.id) >= 0) return;
        var cx = other.x + other.width / 2;
        var cy = other.y + other.height / 2;
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) moving.push(other.id);
      });
    }

    /* Dragging any grouped element (or one inside a moved context) moves its group. */
    var movingSet = new Set(moving);
    moving.forEach(function (id) {
      var member = ESB.store.getElement(id);
      if (!member || !member.groupId) return;
      ESB.store.getGroupMemberIds(member.groupId).forEach(function (memberId) {
        movingSet.add(memberId);
      });
    });
    moving = Array.from(movingSet);

    var origins = moving.map(function (id) {
      var el = ESB.store.getElement(id);
      return { id: id, x: el.x, y: el.y, nextX: null, nextY: null };
    });

    dragSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origins: origins,
      moved: false,
      rootId: element.id
    };

    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(event) {
    if (!dragSession || event.pointerId !== dragSession.pointerId) return;
    var dx = event.clientX - dragSession.startX;
    var dy = event.clientY - dragSession.startY;

    if (!dragSession.moved) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dragSession.moved = true;
      document.body.classList.add('is-moving-element');
    }

    var zoom = ESB.canvas.getZoom();
    var settings = ESB.store.getBoard().settings;
    var boardDx = dx / zoom;
    var boardDy = dy / zoom;

    /* Snap once for the dragged element so a group keeps its internal spacing. */
    var rootOrigin = null;
    for (var i = 0; i < dragSession.origins.length; i += 1) {
      if (dragSession.origins[i].id === dragSession.rootId) {
        rootOrigin = dragSession.origins[i];
        break;
      }
    }
    if (!rootOrigin) rootOrigin = dragSession.origins[0];
    var offsetX;
    var offsetY;
    if (settings.snap) {
      offsetX = snapValue(rootOrigin.x + boardDx, settings) - rootOrigin.x;
      offsetY = snapValue(rootOrigin.y + boardDy, settings) - rootOrigin.y;
    } else {
      offsetX = Math.round(boardDx);
      offsetY = Math.round(boardDy);
    }

    dragSession.origins.forEach(function (origin) {
      var nextX = Math.round(origin.x + offsetX);
      var nextY = Math.round(origin.y + offsetY);
      origin.nextX = nextX;
      origin.nextY = nextY;
      var node = nodes.get(origin.id);
      if (node) {
        node.style.left = nextX + 'px';
        node.style.top = nextY + 'px';
      }
    });

    syncOverlays();
  }

  function onDragEnd(event) {
    if (!dragSession) return;
    if (event && event.pointerId !== dragSession.pointerId) return;

    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    document.body.classList.remove('is-moving-element');

    var session = dragSession;
    dragSession = null;
    if (!session.moved) return;

    var positions = session.origins
      .filter(function (origin) { return origin.nextX != null; })
      .map(function (origin) {
        return { id: origin.id, x: origin.nextX, y: origin.nextY };
      });

    var patches = [];
    session.origins.forEach(function (origin) {
      if (origin.nextX == null || origin.nextY == null) return;
      var moved = ESB.store.getElement(origin.id);
      if (!moved || moved.type === 'boundedContext') return;
      var center = {
        x: origin.nextX + moved.width / 2,
        y: origin.nextY + moved.height / 2
      };
      var context = model.findContextForPoint(ESB.store.getElements(), center);
      var nextContextId = context ? context.id : null;
      if (moved.contextId !== nextContextId) {
        patches.push({ id: moved.id, patch: { contextId: nextContextId } });
      }
    });

    ESB.store.moveElements(positions, patches);
  }

  function startResize(event, element, node) {
    resizeSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: element.width,
      startHeight: element.height,
      width: element.width,
      height: element.height,
      id: element.id
    };
    node.classList.add('is-resizing');
    document.addEventListener('pointermove', onResizeMove);
    document.addEventListener('pointerup', onResizeEnd);
    document.addEventListener('pointercancel', onResizeEnd);
  }

  function onResizeMove(event) {
    if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
    var element = ESB.store.getElement(resizeSession.id);
    if (!element) return;
    var info = model.typeInfo(element.type);
    var zoom = ESB.canvas.getZoom();
    var settings = ESB.store.getBoard().settings;
    var dx = (event.clientX - resizeSession.startX) / zoom;
    var dy = (event.clientY - resizeSession.startY) / zoom;

    resizeSession.width = Math.max(info.min[0], snapValue(resizeSession.startWidth + dx, settings));
    resizeSession.height = Math.max(info.min[1], snapValue(resizeSession.startHeight + dy, settings));

    var node = nodes.get(resizeSession.id);
    if (node) {
      node.style.width = resizeSession.width + 'px';
      node.style.height = resizeSession.height + 'px';
    }

    syncOverlays();
  }

  function onResizeEnd(event) {
    if (!resizeSession) return;
    if (event && event.pointerId !== resizeSession.pointerId) return;

    document.removeEventListener('pointermove', onResizeMove);
    document.removeEventListener('pointerup', onResizeEnd);
    document.removeEventListener('pointercancel', onResizeEnd);

    var session = resizeSession;
    resizeSession = null;
    var node = nodes.get(session.id);
    if (node) node.classList.remove('is-resizing');

    ESB.store.updateElement(session.id, {
      width: session.width,
      height: session.height
    }, { label: 'Resize' });
  }

  function selectAllText(element) {
    var range = document.createRange();
    range.selectNodeContents(element);
    var selection = global.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function startTitleEdit(id) {
    var node = nodes.get(id);
    if (!node) return;
    if (node.dataset.editing === '1') return;
    var titleEl = node.querySelector('.element__title');
    if (!titleEl) return;

    var before = titleEl.textContent;
    node.dataset.editing = '1';
    node.classList.add('is-editing');
    titleEl.setAttribute('contenteditable', 'true');
    titleEl.setAttribute('spellcheck', 'false');
    titleEl.setAttribute('role', 'textbox');
    titleEl.setAttribute('aria-label', 'Element title');
    titleEl.setAttribute('aria-multiline', 'false');
    titleEl.classList.add('is-editing');
    titleEl.focus({ preventScroll: true });
    selectAllText(titleEl);

    var finished = false;

    function onKeyDown(event) {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
        node.focus({ preventScroll: true });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        node.focus({ preventScroll: true });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        finish(true);
        node.focus({ preventScroll: true });
      }
    }

    function onBlur() {
      finish(true);
    }

    function finish(commit) {
      if (finished) return;
      finished = true;
      titleEl.removeEventListener('keydown', onKeyDown);
      titleEl.removeEventListener('blur', onBlur);
      titleEl.removeAttribute('contenteditable');
      titleEl.removeAttribute('role');
      titleEl.removeAttribute('aria-label');
      titleEl.removeAttribute('aria-multiline');
      titleEl.classList.remove('is-editing');
      node.classList.remove('is-editing');
      delete node.dataset.editing;

      var value = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!commit || !value) {
        titleEl.textContent = before;
        return;
      }
      if (value !== before) {
        ESB.store.updateElement(id, { title: value }, { label: 'Rename' });
      } else {
        titleEl.textContent = before;
      }
    }

    titleEl.addEventListener('keydown', onKeyDown);
    titleEl.addEventListener('blur', onBlur);
  }

  function onDoubleClick(event) {
    var node = event.target.closest ? event.target.closest('.element') : null;
    if (!node) return;
    if (event.target.closest('.element__resize')) return;
    startTitleEdit(node.dataset.id);
  }

  function onKeyDown(event) {
    var node = event.target.closest ? event.target.closest('.element') : null;
    if (!node || event.target !== node) return;

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      var element = ESB.store.getElement(node.dataset.id);
      if (!element) return;
      var memberIds = selectionFor(element, Boolean(event.altKey));
      if (event.shiftKey || event.ctrlKey || event.metaKey) ESB.store.toggleElements(memberIds);
      else ESB.store.select(memberIds);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      ESB.store.select(selectionFor(ESB.store.getElement(node.dataset.id), Boolean(event.altKey)));
      startTitleEdit(node.dataset.id);
    }
  }

  function addAtBoardPoint(type, x, y) {
    var info = model.typeInfo(type);
    if (!info) return null;
    var settings = ESB.store.getBoard().settings;
    var left = snapValue(x - info.size[0] / 2, settings);
    var top = snapValue(y - info.size[1] / 2, settings);
    var element = ESB.store.addElement(type, left, top);
    var center = {
      x: left + info.size[0] / 2,
      y: top + info.size[1] / 2
    };
    var context = model.findContextForPoint(ESB.store.getElements(), center);
    if (context) {
      ESB.store.updateElement(element.id, { contextId: context.id }, { label: 'Assign context' });
    }
    return element;
  }

  function addAtViewportCenter(type) {
    var rect = ESB.canvas.getVisibleBoardRect();
    var offset = (ESB.store.getElements().length % 7) * 18;
    return addAtBoardPoint(type, rect.x + rect.width / 2 + offset, rect.y + rect.height / 2 + offset);
  }

  function addAtClientPoint(type, clientX, clientY) {
    var point = ESB.canvas.screenToBoard(clientX, clientY);
    return addAtBoardPoint(type, point.x, point.y);
  }

  ESB.elements = {
    init: init,
    sync: sync,
    getNode: getNode,
    getLiveBox: getLiveBox,
    startTitleEdit: startTitleEdit,
    addAtBoardPoint: addAtBoardPoint,
    addAtViewportCenter: addAtViewportCenter,
    addAtClientPoint: addAtClientPoint,
    isTypingTarget: isTypingTarget
  };
})(window);
