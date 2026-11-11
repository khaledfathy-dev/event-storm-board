/*
 * Event Storm Board — visual group outlines.
 * Groups are membership-only in the model; this layer draws a live bounding
 * box around each group's members and lets the label select the whole group.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var NS = 'http://www.w3.org/2000/svg';

  var layer = null;
  var root = null;
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

  function liveBox(id) {
    if (ESB.elements && ESB.elements.getLiveBox) return ESB.elements.getLiveBox(id);
    return ESB.store.getElement(id);
  }

  function boundsFor(group) {
    var boxes = (group.elementIds || []).map(liveBox).filter(Boolean);
    if (boxes.length < 2) return null;

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    boxes.forEach(function (box) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    });

    var padding = 14;
    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2)
    };
  }

  function renderGroup(group) {
    var bounds = boundsFor(group);
    if (!bounds) return;

    var selected = ESB.store.isGroupSelected(group.id);
    var memberCount = (group.elementIds || []).length;
    var outline = svg('g', {
      'class': 'group-outline' + (selected ? ' is-selected' : ''),
      'data-group-id': group.id
    });

    outline.appendChild(svg('rect', {
      'class': 'group-outline__box',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rx: 12,
      ry: 12
    }));

    var label = svg('g', {
      'class': 'group-outline__label',
      'data-group-id': group.id,
      tabindex: '0',
      role: 'button',
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': 'Group ' + (group.name || 'Group') + ', ' + memberCount +
        (memberCount === 1 ? ' element' : ' elements') +
        (selected ? ', selected' : '') + '. Press Enter to select the group.'
    });

    var chip = svg('rect', {
      'class': 'group-outline__chip',
      x: bounds.x + 12,
      y: bounds.y - 10,
      width: 80,
      height: 20,
      rx: 6,
      ry: 6
    });
    label.appendChild(chip);

    var text = svg('text', {
      'class': 'group-outline__text',
      x: bounds.x + 22,
      y: bounds.y + 4
    });
    text.textContent = group.name || 'Group';
    label.appendChild(text);
    outline.appendChild(label);
    root.appendChild(outline);

    var width = 0;
    try { width = text.getComputedTextLength(); } catch (err) { width = 0; }
    if (!width) width = (group.name || 'Group').length * 6.2;
    chip.setAttribute('width', String(width + 20));
  }

  function sync() {
    if (!root) return;
    var focused = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('.group-outline__label')
      : null;
    var focusedId = focused ? focused.getAttribute('data-group-id') : null;

    while (root.firstChild) root.removeChild(root.firstChild);
    ESB.store.getGroups().forEach(renderGroup);

    if (!focusedId) return;
    var replacement = root.querySelector('.group-outline__label[data-group-id="' + focusedId + '"]');
    if (replacement) {
      try { replacement.focus({ preventScroll: true }); } catch (err) { replacement.focus(); }
      return;
    }
    var surface = document.getElementById('canvasSurface');
    if (surface) surface.focus({ preventScroll: true });
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (ESB.canvas && ESB.canvas.isSpaceDown()) return;
    var label = event.target.closest ? event.target.closest('.group-outline__label') : null;
    if (!label) return;
    var groupId = label.getAttribute('data-group-id');
    if (!groupId) return;
    event.preventDefault();
    event.stopPropagation();
    ESB.store.selectGroup(groupId);
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var label = event.target.closest ? event.target.closest('.group-outline__label') : null;
    if (!label) return;
    var groupId = label.getAttribute('data-group-id');
    if (!groupId) return;
    event.preventDefault();
    event.stopPropagation();
    ESB.store.selectGroup(groupId);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    layer = document.getElementById('groupsLayer');
    if (!layer) return;
    root = svg('g', { 'class': 'groups' });
    layer.appendChild(root);
    layer.addEventListener('pointerdown', onPointerDown);
    layer.addEventListener('keydown', onKeyDown);
  }

  ESB.groups = {
    init: init,
    sync: sync,
    boundsFor: boundsFor
  };
})(window);
