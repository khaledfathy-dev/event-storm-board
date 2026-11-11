/*
 * Event Storm Board — properties panel.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;

  var refs = {};
  var currentId = null;
  var currentConnectionId = null;
  var currentGroupId = null;
  var initialized = false;

  var SIMPLE_FIELDS = [
    ['title', 'title'],
    ['description', 'description'],
    ['rules', 'businessRules'],
    ['notes', 'notes']
  ];

  function init() {
    if (initialized) return;
    initialized = true;

    refs = {
      scroll: document.getElementById('inspectorScroll'),
      empty: document.getElementById('inspectorEmpty'),
      body: document.getElementById('inspectorBody'),
      connection: document.getElementById('inspectorConnection'),
      multi: document.getElementById('inspectorMulti'),
      heading: document.getElementById('inspectorTitle'),
      boardStats: document.getElementById('boardStats'),
      type: document.getElementById('fieldType'),
      typeChip: document.getElementById('fieldTypeChip'),
      title: document.getElementById('fieldTitle'),
      description: document.getElementById('fieldDescription'),
      rules: document.getElementById('fieldRules'),
      notes: document.getElementById('fieldNotes'),
      metaList: document.getElementById('metaList'),
      metaEmpty: document.getElementById('metaEmpty'),
      addMeta: document.getElementById('btnAddMeta'),
      x: document.getElementById('fieldX'),
      y: document.getElementById('fieldY'),
      w: document.getElementById('fieldW'),
      h: document.getElementById('fieldH'),
      context: document.getElementById('fieldContext'),
      contextMembers: document.getElementById('contextMembers'),
      contextMemberCount: document.getElementById('contextMemberCount'),
      selectMembers: document.getElementById('btnSelectMembers'),
      groupField: document.getElementById('groupField'),
      groupName: document.getElementById('fieldGroupName'),
      ungroupElement: document.getElementById('btnUngroupElement'),
      id: document.getElementById('fieldId'),
      duplicate: document.getElementById('btnDuplicate'),
      remove: document.getElementById('btnDelete'),
      duplicateMulti: document.getElementById('btnDuplicateMulti'),
      removeMulti: document.getElementById('btnDeleteMulti'),
      multiTitle: document.getElementById('multiTitle'),
      connectField: document.getElementById('connectField'),
      connectSelection: document.getElementById('btnConnectSelection'),
      multiGroupName: document.getElementById('multiGroupName'),
      multiGroupHint: document.getElementById('multiGroupHint'),
      groupMulti: document.getElementById('btnGroupMulti'),
      ungroupMulti: document.getElementById('btnUngroupMulti'),
      close: document.getElementById('btnCloseInspector'),
      connectionTypeChip: document.getElementById('connectionTypeChip'),
      connectionFrom: document.getElementById('connectionFrom'),
      connectionTo: document.getElementById('connectionTo'),
      connectionLabel: document.getElementById('connectionLabel'),
      connectionType: document.getElementById('connectionType'),
      connectionStyle: document.getElementById('connectionStyle'),
      connectionId: document.getElementById('connectionId'),
      swapConnection: document.getElementById('btnSwapConnection'),
      deleteConnection: document.getElementById('btnDeleteConnection')
    };

    model.TYPE_ORDER.forEach(function (type) {
      var option = document.createElement('option');
      option.value = type;
      option.textContent = model.typeInfo(type).label;
      refs.type.appendChild(option);
    });

    Object.keys(model.CONNECTION_TYPES).forEach(function (type) {
      var option = document.createElement('option');
      option.value = type;
      option.textContent = model.CONNECTION_TYPES[type].label;
      refs.connectionType.appendChild(option);
    });

    Object.keys(model.CONNECTION_STYLES).forEach(function (style) {
      var option = document.createElement('option');
      option.value = style;
      option.textContent = model.CONNECTION_STYLES[style];
      refs.connectionStyle.appendChild(option);
    });

    SIMPLE_FIELDS.forEach(function (pair) {
      var input = refs[pair[0]];
      var key = pair[1];
      input.addEventListener('input', function () {
        if (!currentId) return;
        var patch = {};
        patch[key] = input.value;
        ESB.store.updateElement(currentId, patch, {
          label: 'Edit ' + key,
          coalesce: key + ':' + currentId
        });
      });
    });

    refs.type.addEventListener('change', function () {
      if (!currentId) return;
      ESB.store.updateElement(currentId, { type: refs.type.value }, { label: 'Change type' });
      sync();
    });

    [['x', 'x'], ['y', 'y'], ['w', 'width'], ['h', 'height']].forEach(function (pair) {
      var input = refs[pair[0]];
      input.addEventListener('change', function () {
        if (!currentId) return;
        var element = ESB.store.getElement(currentId);
        if (!element) return;
        var info = model.typeInfo(element.type);
        var key = pair[1];
        var value = Number(input.value);
        if (!isFinite(value)) {
          sync();
          return;
        }
        if (key === 'width') value = Math.max(info.min[0], Math.round(value));
        if (key === 'height') value = Math.max(info.min[1], Math.round(value));
        if (key === 'x' || key === 'y') value = Math.round(value);
        var patch = {};
        patch[key] = value;
        ESB.store.updateElement(currentId, patch, { label: 'Change ' + key });
      });
    });

    refs.context.addEventListener('change', function () {
      if (!currentId) return;
      ESB.store.updateElement(currentId, {
        contextId: refs.context.value || null
      }, { label: 'Assign bounded context' });
    });

    refs.groupName.addEventListener('input', function () {
      if (!currentGroupId) return;
      var value = refs.groupName.value.replace(/\s+/g, ' ').trim();
      if (!value) return;
      ESB.store.renameGroup(currentGroupId, value);
    });

    refs.groupName.addEventListener('blur', function () {
      var group = currentGroupId ? ESB.store.getGroup(currentGroupId) : null;
      if (group) refs.groupName.value = group.name;
    });

    refs.ungroupElement.addEventListener('click', function () {
      if (!currentId) return;
      ESB.store.ungroupElements([currentId]);
    });

    refs.selectMembers.addEventListener('click', function () {
      if (!currentId) return;
      var ids = ESB.store.getElements().filter(function (element) {
        return element.contextId === currentId;
      }).map(function (element) { return element.id; });
      if (ids.length) ESB.store.select(ids);
    });

    refs.groupMulti.addEventListener('click', function () {
      var name = refs.multiGroupName.value.replace(/\s+/g, ' ').trim();
      ESB.store.groupElements(ESB.store.getSelection(), name ? { name: name } : {});
    });

    refs.multiGroupName.addEventListener('change', function () {
      var group = ESB.store.getGroupForSelection();
      if (!group) return;
      var name = refs.multiGroupName.value.replace(/\s+/g, ' ').trim();
      if (name && name !== group.name) ESB.store.renameGroup(group.id, name);
    });

    refs.ungroupMulti.addEventListener('click', function () {
      ESB.store.ungroupElements(ESB.store.getSelection());
    });

    refs.connectSelection.addEventListener('click', function () {
      var ids = ESB.store.getSelection();
      if (ids.length !== 2) return;
      var created = ESB.store.addConnection({
        from: { elementId: ids[0], side: 'auto' },
        to: { elementId: ids[1], side: 'auto' }
      });
      if (!created) {
        ESB.ui.toast('Those two elements cannot be connected.', { type: 'error' });
        return;
      }
      ESB.ui.toast('Connection created — add a label if it helps.');
      if (ESB.a11y) {
        ESB.a11y.announce('Connection created. Connection properties are ready. Press Tab to the label field to name it.');
      }
      setTimeout(function () {
        if (refs.connectionLabel) refs.connectionLabel.focus({ preventScroll: true });
      }, 60);
    });

    refs.addMeta.addEventListener('click', function () {
      if (!currentId) return;
      addMetaRow('', '');
      var rows = refs.metaList.querySelectorAll('.meta-row');
      var last = rows[rows.length - 1];
      if (last) last.querySelector('.meta-row__key').focus();
      refs.metaEmpty.hidden = true;
    });

    refs.duplicate.addEventListener('click', function () {
      if (!currentId) return;
      ESB.store.duplicateElements([currentId]);
    });

    refs.remove.addEventListener('click', function () {
      if (!currentId) return;
      ESB.store.removeElements([currentId]);
      focusBoard();
    });

    refs.duplicateMulti.addEventListener('click', function () {
      ESB.store.duplicateElements(ESB.store.getSelection());
    });

    refs.removeMulti.addEventListener('click', function () {
      ESB.store.removeElements(ESB.store.getSelection());
      focusBoard();
    });

    refs.connectionLabel.addEventListener('input', function () {
      if (!currentConnectionId) return;
      ESB.store.updateConnection(currentConnectionId, { label: refs.connectionLabel.value }, {
        label: 'Edit connection label',
        coalesce: 'connection-label:' + currentConnectionId
      });
    });

    refs.connectionType.addEventListener('change', function () {
      if (!currentConnectionId) return;
      ESB.store.updateConnection(currentConnectionId, { type: refs.connectionType.value }, {
        label: 'Change connection type'
      });
      sync();
    });

    refs.connectionStyle.addEventListener('change', function () {
      if (!currentConnectionId) return;
      ESB.store.updateConnection(currentConnectionId, { style: refs.connectionStyle.value }, {
        label: 'Change connection style'
      });
      sync();
    });

    refs.swapConnection.addEventListener('click', function () {
      if (!currentConnectionId) return;
      ESB.store.swapConnection(currentConnectionId);
      sync();
    });

    refs.deleteConnection.addEventListener('click', function () {
      if (!currentConnectionId) return;
      ESB.store.removeConnection(currentConnectionId);
      focusBoard();
    });

    if (refs.close) {
      refs.close.addEventListener('click', close);
    }
  }

  function focusBoard() {
    var surface = document.getElementById('canvasSurface');
    if (!surface) return;
    try { surface.focus({ preventScroll: true }); } catch (err) { surface.focus(); }
  }

  function addMetaRow(key, value) {
    var row = document.createElement('div');
    row.className = 'meta-row';
    row.dataset.key = key;

    var keyInput = document.createElement('input');
    keyInput.className = 'input meta-row__key';
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = key;
    keyInput.maxLength = 60;
    keyInput.setAttribute('aria-label', 'Metadata key');

    var valueInput = document.createElement('input');
    valueInput.className = 'input meta-row__value';
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.value = value;
    valueInput.maxLength = 500;
    valueInput.setAttribute('aria-label', 'Metadata value');

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn icon-btn--subtle meta-row__remove';
    remove.setAttribute('aria-label', 'Remove metadata field');
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

    function commit() {
      if (!currentId) return;
      var metadata = {};
      refs.metaList.querySelectorAll('.meta-row').forEach(function (rowEl) {
        var k = rowEl.querySelector('.meta-row__key').value.trim();
        var v = rowEl.querySelector('.meta-row__value').value;
        if (k) metadata[k] = v;
      });
      ESB.store.updateElement(currentId, { metadata: metadata }, {
        label: 'Edit metadata',
        coalesce: 'metadata:' + currentId
      });
    }

    keyInput.addEventListener('change', commit);
    valueInput.addEventListener('change', commit);

    remove.addEventListener('click', function () {
      row.remove();
      commit();
      refs.metaEmpty.hidden = refs.metaList.querySelectorAll('.meta-row').length > 0;
      try { refs.addMeta.focus({ preventScroll: true }); } catch (err) { refs.addMeta.focus(); }
    });

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(remove);
    refs.metaList.appendChild(row);
    refs.metaEmpty.hidden = true;
  }

  function renderMeta(element) {
    refs.metaList.innerHTML = '';
    var metadata = element.metadata || {};
    var keys = Object.keys(metadata);
    keys.forEach(function (key) {
      addMetaRow(key, metadata[key]);
    });
    refs.metaEmpty.hidden = keys.length > 0;
  }

  function renderStats() {
    var stats = ESB.store.getStats();
    var html = '';
    html += '<div class="stats__totals">' +
      '<div class="stat"><span class="stat__value">' + stats.elements + '</span><span class="stat__label">Elements</span></div>' +
      '<div class="stat"><span class="stat__value">' + stats.connections + '</span><span class="stat__label">Links</span></div>' +
      '<div class="stat"><span class="stat__value">' + stats.contexts + '</span><span class="stat__label">Contexts</span></div>' +
      '</div>';

    var rows = model.TYPE_ORDER.filter(function (type) {
      return stats.counts[type] > 0;
    }).map(function (type) {
      var info = model.typeInfo(type);
      return '<div class="stats__row">' +
        '<span class="stats__dot" style="background:' + info.color + '"></span>' +
        '<span class="stats__name">' + info.plural + '</span>' +
        '<span class="stats__count">' + stats.counts[type] + '</span>' +
        '</div>';
    }).join('');

    if (rows) html += '<div class="stats__rows">' + rows + '</div>';
    refs.boardStats.innerHTML = html;
  }

  function setInput(input, value) {
    if (!input) return;
    if (document.activeElement === input) return;
    var next = value == null ? '' : String(value);
    if (input.value !== next) input.value = next;
  }

  function renderContextOptions(element) {
    var containers = ESB.store.getContainers().filter(function (container) {
      return container.id !== element.id;
    });
    var signature = containers.map(function (c) { return c.id + ':' + c.title; }).join('|');
    if (refs.context.dataset.signature !== signature) {
      refs.context.innerHTML = '';
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No bounded context';
      refs.context.appendChild(none);
      containers.forEach(function (container) {
        var option = document.createElement('option');
        option.value = container.id;
        option.textContent = container.title || 'Bounded context';
        refs.context.appendChild(option);
      });
      refs.context.dataset.signature = signature;
    }
    var desired = element.contextId || '';
    if (containers.some(function (c) { return c.id === desired; })) {
      refs.context.value = desired;
    } else {
      refs.context.value = '';
    }
  }

  function renderContextMembers(element) {
    var isContainer = element.type === 'boundedContext';
    refs.contextMembers.hidden = !isContainer;
    if (!isContainer) {
      refs.contextMemberCount.textContent = '0 elements';
      refs.selectMembers.disabled = true;
      return;
    }
    var count = ESB.store.getElements().filter(function (candidate) {
      return candidate.contextId === element.id;
    }).length;
    refs.contextMemberCount.textContent = count + (count === 1 ? ' element' : ' elements');
    refs.selectMembers.disabled = count === 0;
  }

  function renderGroup(element) {
    var group = ESB.store.getGroupForElement(element.id);
    currentGroupId = group ? group.id : null;
    refs.groupField.hidden = !group;
    if (!group) {
      setInput(refs.groupName, '');
      return;
    }
    setInput(refs.groupName, group.name);
  }

  function renderMultiGroup(ids) {
    var selected = ids.map(ESB.store.getElement).filter(Boolean);
    var eligible = selected.filter(function (element) {
      return element.type !== 'boundedContext';
    });
    var group = ESB.store.getGroupForSelection();

    if (group) {
      if (document.activeElement !== refs.multiGroupName) {
        refs.multiGroupName.value = group.name;
      }
    } else if (document.activeElement !== refs.multiGroupName) {
      refs.multiGroupName.value = '';
    }

    refs.groupMulti.disabled = eligible.length < 2;
    refs.ungroupMulti.hidden = !selected.some(function (element) { return Boolean(element.groupId); });

    if (eligible.length < 2) {
      refs.multiGroupHint.textContent =
        'Select at least two non-container elements to create a group.';
    } else if (group) {
      refs.multiGroupHint.textContent =
        'These elements belong to "' + group.name + '". Change the name or ungroup them.';
    } else {
      refs.multiGroupHint.textContent =
        'Group the selection to select and move it together.';
    }
  }

  function renderConnection(connection) {
    var typeInfo = model.CONNECTION_TYPES[connection.type] || model.CONNECTION_TYPES.flow;
    var from = ESB.store.getElement(connection.from.elementId);
    var to = ESB.store.getElement(connection.to.elementId);

    refs.heading.textContent = 'Connection properties';
    refs.connectionTypeChip.textContent = typeInfo.label;
    refs.connectionTypeChip.style.background = typeInfo.color;
    refs.connectionTypeChip.style.color = model.contrastInk(typeInfo.color);
    refs.connectionFrom.value = from ? (from.title || 'Untitled') : 'Missing element';
    refs.connectionTo.value = to ? (to.title || 'Untitled') : 'Missing element';
    setInput(refs.connectionLabel, connection.label);
    refs.connectionType.value = connection.type;
    refs.connectionStyle.value = connection.style;
    refs.connectionId.textContent = connection.id;
  }

  function sync() {
    if (!initialized) return;
    var selection = ESB.store.getSelection();
    var connectionId = ESB.store.getSelectedConnectionId();
    var connection = connectionId ? ESB.store.getConnection(connectionId) : null;

    refs.empty.hidden = selection.length !== 0 || Boolean(connection);
    refs.body.hidden = selection.length !== 1;
    refs.connection.hidden = !connection;
    refs.multi.hidden = selection.length < 2;
    refs.connectField.hidden = selection.length !== 2;

    if (connection) {
      currentId = null;
      currentGroupId = null;
      refs.heading.textContent = 'Connection properties';
      if (currentConnectionId !== connection.id) {
        currentConnectionId = connection.id;
        refs.connectionLabel.value = connection.label || '';
      }
      renderConnection(connection);
      return;
    }

    currentConnectionId = null;
    refs.heading.textContent = 'Properties';

    if (selection.length === 0) {
      currentId = null;
      currentGroupId = null;
      renderStats();
      return;
    }

    if (selection.length > 1) {
      currentId = null;
      currentGroupId = null;
      refs.multiTitle.textContent = selection.length + ' elements selected';
      renderStats();
      renderMultiGroup(selection);
      return;
    }

    var id = selection[0];
    var element = ESB.store.getElement(id);
    if (!element) {
      currentId = null;
      refs.empty.hidden = false;
      refs.body.hidden = true;
      renderStats();
      return;
    }

    var info = model.typeInfo(element.type);
    var selectionChanged = currentId !== id;
    currentId = id;

    refs.type.value = element.type;
    setInput(refs.title, element.title);
    setInput(refs.description, element.description);
    setInput(refs.rules, element.businessRules);
    setInput(refs.notes, element.notes);
    setInput(refs.x, element.x);
    setInput(refs.y, element.y);
    setInput(refs.w, element.width);
    setInput(refs.h, element.height);
    refs.title.placeholder = info.placeholder;
    refs.id.textContent = element.id;
    refs.typeChip.textContent = info.label;
    refs.typeChip.style.background = element.color || info.color;
    refs.typeChip.style.color = model.contrastInk(element.color || info.color);

    renderContextOptions(element);
    renderContextMembers(element);
    renderGroup(element);

    if (selectionChanged) {
      renderMeta(element);
      refs.scroll.scrollTop = 0;
    }
  }

  function open() {
    if (ESB.toolbar && typeof ESB.toolbar.setPanel === 'function') {
      ESB.toolbar.setPanel('inspector', true, { focus: true });
      return;
    }
    document.getElementById('app').classList.add('inspector-open');
    var button = document.getElementById('btnToggleInspector');
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (ESB.toolbar && typeof ESB.toolbar.setPanel === 'function') {
      ESB.toolbar.setPanel('inspector', false, { returnFocus: true });
      return;
    }
    var panel = document.getElementById('inspector');
    var hadFocus = Boolean(panel && panel.contains(document.activeElement));
    document.getElementById('app').classList.remove('inspector-open');
    var button = document.getElementById('btnToggleInspector');
    if (button) button.setAttribute('aria-expanded', 'false');
    if (hadFocus && button) {
      try { button.focus({ preventScroll: true }); } catch (err) { button.focus(); }
    }
  }

  ESB.inspector = {
    init: init,
    sync: sync,
    open: open,
    close: close
  };
})(window);
