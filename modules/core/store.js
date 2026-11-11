/*
 * Event Storm Board — central board state.
 * All mutations go through here so undo, autosave and rendering stay consistent.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;

  var project = null;
  var selection = new Set();
  var selectedConnectionId = null;
  var listeners = new Set();
  var history = null;
  var dirty = false;
  var savedAt = null;

  function emit(reason) {
    listeners.forEach(function (handler) {
      try {
        handler(reason || 'change');
      } catch (err) {
        console.error('Board listener failed:', err);
      }
    });
  }

  function onChange(handler) {
    listeners.add(handler);
    return function () { listeners.delete(handler); };
  }

  function init(initialProject) {
    project = initialProject;
    selection = new Set();
    selectedConnectionId = null;
    dirty = false;
    savedAt = null;

    history = new ESB.SnapshotHistory({
      limit: 60,
      getCurrent: function () {
        return model.boardSnapshot(project.board);
      },
      onRestore: function (board) {
        project.board = board;
        pruneSelection();
        dirty = true;
        emit('restore');
      }
    });
  }

  function pruneSelection() {
    var valid = Object.create(null);
    project.board.elements.forEach(function (el) { valid[el.id] = true; });
    var next = new Set();
    selection.forEach(function (id) {
      if (valid[id]) next.add(id);
    });
    selection = next;

    if (selectedConnectionId) {
      var connection = getConnection(selectedConnectionId);
      if (!connection) selectedConnectionId = null;
    }
  }

  function getProject() {
    return project;
  }

  function getBoard() {
    return project ? project.board : null;
  }

  function getElements() {
    return project ? project.board.elements : [];
  }

  function getConnections() {
    return project ? project.board.connections : [];
  }

  function getElement(id) {
    if (!project) return null;
    for (var i = 0; i < project.board.elements.length; i += 1) {
      if (project.board.elements[i].id === id) return project.board.elements[i];
    }
    return null;
  }

  function getConnection(id) {
    if (!project) return null;
    for (var i = 0; i < project.board.connections.length; i += 1) {
      if (project.board.connections[i].id === id) return project.board.connections[i];
    }
    return null;
  }

  function getGroups() {
    return project ? project.board.groups : [];
  }

  function getGroup(id) {
    if (!project) return null;
    for (var i = 0; i < project.board.groups.length; i += 1) {
      if (project.board.groups[i].id === id) return project.board.groups[i];
    }
    return null;
  }

  function getGroupMemberIds(groupId) {
    var group = getGroup(groupId);
    return group ? group.elementIds.slice() : [];
  }

  function getGroupMembers(groupId) {
    return getGroupMemberIds(groupId).map(getElement).filter(Boolean);
  }

  function getGroupForElement(elementId) {
    var element = getElement(elementId);
    if (!element || !element.groupId) return null;
    return getGroup(element.groupId);
  }

  function findSharedGroup(ids) {
    var groupId = null;
    var list = ids || [];
    if (!list.length) return null;
    for (var i = 0; i < list.length; i += 1) {
      var element = getElement(list[i]);
      if (!element || !element.groupId) return null;
      if (groupId && element.groupId !== groupId) return null;
      groupId = element.groupId;
    }
    var group = groupId ? getGroup(groupId) : null;
    return group && group.elementIds.length === list.length ? group : null;
  }

  function getGroupForSelection() {
    return findSharedGroup(getSelection());
  }

  function isGroupSelected(groupId) {
    var group = getGroup(groupId);
    if (!group || !group.elementIds.length) return false;
    return group.elementIds.every(function (id) { return selection.has(id); });
  }

  /*
   * Groups are canonical. Element.groupId is always derived from board.groups
   * so imports, duplicates and deletes cannot leave dangling membership behind.
   */
  function reconcileGroups(board) {
    var claimed = Object.create(null);
    var next = [];
    var seenGroups = Object.create(null);

    (board.groups || []).forEach(function (group) {
      if (!group || !group.id || seenGroups[group.id]) return;
      seenGroups[group.id] = true;

      var seenMembers = Object.create(null);
      var members = [];
      (group.elementIds || []).forEach(function (memberId) {
        if (typeof memberId !== 'string' || seenMembers[memberId]) return;
        var element = null;
        for (var i = 0; i < board.elements.length; i += 1) {
          if (board.elements[i].id === memberId) { element = board.elements[i]; break; }
        }
        if (!element || element.type === 'boundedContext' || claimed[memberId]) return;
        seenMembers[memberId] = true;
        members.push(memberId);
      });

      if (members.length < 2) return;
      members.forEach(function (memberId) { claimed[memberId] = group.id; });
      next.push({
        id: group.id,
        name: group.name || 'Group',
        elementIds: members
      });
    });

    board.groups = next;
    board.elements.forEach(function (element) {
      element.groupId = claimed[element.id] || null;
    });
  }

  function nextGroupName() {
    var used = Object.create(null);
    getGroups().forEach(function (group) {
      used[String(group.name || '').toLowerCase()] = true;
    });
    var index = 1;
    while (used[('group ' + index).toLowerCase()]) index += 1;
    return 'Group ' + index;
  }

  function groupElements(ids, options) {
    var opts = options || {};
    var wanted = [];
    var seen = Object.create(null);
    (ids || []).forEach(function (id) {
      if (seen[id]) return;
      var element = getElement(id);
      if (!element || element.type === 'boundedContext') return;
      seen[id] = true;
      wanted.push(id);
    });
    if (wanted.length < 2) return null;

    var requested = typeof opts.name === 'string'
      ? opts.name.replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';

    var shared = findSharedGroup(wanted);
    if (shared && shared.elementIds.length === wanted.length) {
      if (requested && requested !== shared.name) {
        return renameGroup(shared.id, requested);
      }
      return shared;
    }

    var group = {
      id: model.uid('grp'),
      name: requested || nextGroupName(),
      elementIds: wanted
    };

    mutate(function (board) {
      board.groups = [group].concat(board.groups || []);
      reconcileGroups(board);
    }, { label: 'Group elements' });

    return getGroup(group.id);
  }

  function ungroupElements(ids) {
    var idSet = new Set(ids || []);
    if (!idSet.size) return false;
    var touched = getGroups().some(function (group) {
      return group.elementIds.some(function (id) { return idSet.has(id); });
    });
    if (!touched) return false;

    mutate(function (board) {
      board.groups = (board.groups || []).map(function (group) {
        return {
          id: group.id,
          name: group.name,
          elementIds: group.elementIds.filter(function (id) { return !idSet.has(id); })
        };
      });
      reconcileGroups(board);
    }, { label: 'Ungroup elements' });

    return true;
  }

  function renameGroup(id, name, options) {
    var group = getGroup(id);
    if (!group) return null;
    var opts = options || {};
    var next = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!next || next === group.name) return group;

    mutate(function (board) {
      for (var i = 0; i < board.groups.length; i += 1) {
        if (board.groups[i].id === id) {
          board.groups[i].name = next;
          break;
        }
      }
    }, {
      label: 'Rename group',
      coalesce: opts.coalesce || ('group-name:' + id)
    });

    return getGroup(id);
  }

  function removeGroup(id) {
    var group = getGroup(id);
    if (!group) return false;
    return ungroupElements(group.elementIds);
  }

  function selectGroup(id) {
    var ids = getGroupMemberIds(id);
    if (!ids.length) return;
    select(ids);
  }

  function getSelectedConnectionId() {
    return selectedConnectionId;
  }

  function getSelectedConnection() {
    return selectedConnectionId ? getConnection(selectedConnectionId) : null;
  }

  function selectConnection(id) {
    if (!getConnection(id)) return;
    selection = new Set();
    selectedConnectionId = id;
    emit('selection');
  }

  function clearConnectionSelection() {
    if (!selectedConnectionId) return;
    selectedConnectionId = null;
    emit('selection');
  }

  function getSelection() {
    return Array.from(selection);
  }

  function isSelected(id) {
    return selection.has(id);
  }

  function getSelectedElements() {
    return getSelection().map(getElement).filter(Boolean);
  }

  function select(ids, options) {
    var opts = options || {};
    var next = opts.additive ? new Set(selection) : new Set();
    (ids || []).forEach(function (id) {
      if (!getElement(id)) return;
      if (opts.toggle && next.has(id)) next.delete(id);
      else next.add(id);
    });
    selection = next;
    selectedConnectionId = null;
    emit('selection');
  }

  function toggleSelection(id) {
    if (!getElement(id)) return;
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    selectedConnectionId = null;
    emit('selection');
  }

  function toggleElements(ids) {
    var next = new Set(selection);
    (ids || []).forEach(function (id) {
      if (!getElement(id)) return;
      if (next.has(id)) next.delete(id);
      else next.add(id);
    });
    selection = next;
    selectedConnectionId = null;
    emit('selection');
  }

  function clearSelection() {
    if (!selection.size && !selectedConnectionId) return;
    selection = new Set();
    selectedConnectionId = null;
    emit('selection');
  }

  function selectAll() {
    selection = new Set(getElements().map(function (el) { return el.id; }));
    selectedConnectionId = null;
    emit('selection');
  }

  function mutate(fn, options) {
    if (!project) return;
    var opts = options || {};
    if (opts.history !== false) {
      history.record(model.boardSnapshot(project.board), opts.label || 'Change', opts.coalesce || null);
    }
    fn(project.board);
    project.updatedAt = model.nowISO();
    dirty = true;
    emit(opts.reason || 'change');
  }

  function sanitizePatch(patch) {
    var clean = {};
    if (!patch || typeof patch !== 'object') return clean;
    ['title', 'description', 'businessRules', 'notes'].forEach(function (key) {
      if (patch[key] != null) clean[key] = String(patch[key]);
    });
    ['x', 'y', 'width', 'height', 'z'].forEach(function (key) {
      if (patch[key] != null && isFinite(Number(patch[key]))) clean[key] = Math.round(Number(patch[key]));
    });
    if (patch.color !== undefined) clean.color = model.normalizeColor(patch.color);
    if (patch.contextId !== undefined) clean.contextId = patch.contextId || null;
    if (patch.metadata && typeof patch.metadata === 'object') clean.metadata = model.normalizeMetadata(patch.metadata);
    if (patch.type && model.isType(patch.type)) clean.type = patch.type;
    return clean;
  }

  function updateElement(id, patch, options) {
    var element = getElement(id);
    if (!element) return null;
    var clean = sanitizePatch(patch);
    if (!Object.keys(clean).length) return element;
    var opts = options || {};

    mutate(function (board) {
      var target = null;
      for (var i = 0; i < board.elements.length; i += 1) {
        if (board.elements[i].id === id) { target = board.elements[i]; break; }
      }
      if (!target) return;

      if (clean.type && clean.type !== target.type) {
        var info = model.typeInfo(clean.type);
        target.type = clean.type;
        target.width = Math.max(target.width, info.min[0]);
        target.height = Math.max(target.height, info.min[1]);
        target.z = info.container ? 0 : Math.max(1, target.z || 1);
      }
      Object.keys(clean).forEach(function (key) {
        if (key === 'type') return;
        target[key] = clean[key];
      });
      target.updatedAt = model.nowISO();
    }, {
      label: opts.label || 'Edit element',
      coalesce: opts.coalesce || null
    });

    return getElement(id);
  }

  function addElement(type, x, y, options) {
    var opts = options || {};
    if (!model.isType(type)) throw new Error('Unknown element type: ' + type);
    var element = model.createElement(type, x, y, {
      z: model.nextZ(getElements())
    });
    mutate(function (board) {
      board.elements.push(element);
    }, { label: 'Add ' + model.typeInfo(type).label });
    if (opts.select !== false) select([element.id]);
    return element;
  }

  function addElementObject(element) {
    mutate(function (board) {
      board.elements.push(element);
    }, { label: 'Add element' });
    select([element.id]);
    return element;
  }

  function removeElements(ids) {
    var idSet = new Set(ids || []);
    if (!idSet.size) return;
    mutate(function (board) {
      board.elements = board.elements.filter(function (el) { return !idSet.has(el.id); });
      board.connections = board.connections.filter(function (conn) {
        return !idSet.has(conn.from.elementId) && !idSet.has(conn.to.elementId);
      });
      board.groups = board.groups
        .map(function (group) {
          return {
            id: group.id,
            name: group.name,
            elementIds: group.elementIds.filter(function (memberId) { return !idSet.has(memberId); })
          };
        })
        .filter(function (group) { return group.elementIds.length >= 2; });
      board.elements.forEach(function (el) {
        if (el.contextId && idSet.has(el.contextId)) el.contextId = null;
      });
      reconcileGroups(board);
    }, { label: 'Delete' });

    var next = new Set();
    selection.forEach(function (id) {
      if (!idSet.has(id)) next.add(id);
    });
    selection = next;
    if (selectedConnectionId && !getConnection(selectedConnectionId)) {
      selectedConnectionId = null;
    }
    emit('selection');
  }

  function duplicateElements(ids) {
    var idSet = new Set(ids || []);
    if (!idSet.size) return [];
    var createdIds = [];

    mutate(function (board) {
      var idMap = Object.create(null);
      var copiesBySource = Object.create(null);
      var sources = board.elements.filter(function (el) { return idSet.has(el.id); });

      sources.forEach(function (source) {
        var copy = model.clone(source);
        copy.id = model.uid('el');
        copy.x = source.x + 28;
        copy.y = source.y + 28;
        copy.z = model.nextZ(board.elements);
        copy.contextId = source.contextId;
        copy.createdAt = model.nowISO();
        copy.updatedAt = copy.createdAt;
        idMap[source.id] = copy.id;
        copiesBySource[source.id] = copy;
        board.elements.push(copy);
        createdIds.push(copy.id);
      });

      /* Copied members follow a copied bounded context, not the original. */
      sources.forEach(function (source) {
        if (!source.contextId) return;
        var mappedContextId = idMap[source.contextId];
        if (!mappedContextId) return;
        copiesBySource[source.id].contextId = mappedContextId;
      });

      var groupCopies = [];
      (board.groups || []).forEach(function (group) {
        var copiedMembers = [];
        group.elementIds.forEach(function (memberId) {
          if (idMap[memberId]) copiedMembers.push(idMap[memberId]);
        });
        if (copiedMembers.length >= 2) {
          groupCopies.push({
            id: model.uid('grp'),
            name: (group.name || 'Group') + ' copy',
            elementIds: copiedMembers
          });
        }
      });
      if (groupCopies.length) {
        board.groups = (board.groups || []).concat(groupCopies);
      }
      reconcileGroups(board);

      var connectionCopies = [];
      board.connections.forEach(function (conn) {
        var fromId = idMap[conn.from.elementId];
        var toId = idMap[conn.to.elementId];
        if (fromId && toId) {
          var copy = model.clone(conn);
          copy.id = model.uid('cn');
          copy.from.elementId = fromId;
          copy.to.elementId = toId;
          connectionCopies.push(copy);
        }
      });
      if (connectionCopies.length) {
        board.connections = board.connections.concat(connectionCopies);
      }
    }, { label: 'Duplicate' });

    select(createdIds);
    return createdIds;
  }

  function normalizeSide(value, fallback) {
    return model.CONNECTION_SIDES.indexOf(value) >= 0 ? value : fallback;
  }

  function normalizeConnection(input) {
    var type = model.CONNECTION_TYPES[input.type] ? input.type : 'flow';
    var defaults = model.CONNECTION_TYPES[type];
    return {
      id: input.id,
      from: {
        elementId: input.from.elementId,
        side: normalizeSide(input.from.side, 'auto')
      },
      to: {
        elementId: input.to.elementId,
        side: normalizeSide(input.to.side, 'auto')
      },
      type: type,
      style: model.CONNECTION_STYLES[input.style] ? input.style : defaults.style,
      label: typeof input.label === 'string' ? input.label.slice(0, 200) : '',
      metadata: input.metadata && typeof input.metadata === 'object'
        ? model.normalizeMetadata(input.metadata)
        : {}
    };
  }

  function addConnection(input) {
    if (!input || !input.from || !input.to) return null;
    var fromId = input.from.elementId;
    var toId = input.to.elementId;
    if (!fromId || !toId || fromId === toId) return null;
    if (!getElement(fromId) || !getElement(toId)) return null;

    var connection = normalizeConnection({
      id: model.uid('cn'),
      from: { elementId: fromId, side: input.from.side },
      to: { elementId: toId, side: input.to.side },
      type: input.type,
      style: input.style,
      label: input.label,
      metadata: input.metadata
    });

    mutate(function (board) {
      board.connections.push(connection);
    }, { label: 'Add connection' });

    selectConnection(connection.id);
    return connection;
  }

  function updateConnection(id, patch, options) {
    var connection = getConnection(id);
    if (!connection || !patch) return connection;

    var next = model.clone(connection);
    if (patch.label != null) next.label = String(patch.label).slice(0, 200);
    if (patch.type != null && model.CONNECTION_TYPES[patch.type]) {
      next.type = patch.type;
    }
    if (patch.style != null && model.CONNECTION_STYLES[patch.style]) {
      next.style = patch.style;
    }
    if (patch.from && patch.from.elementId && getElement(patch.from.elementId)) {
      next.from.elementId = patch.from.elementId;
    }
    if (patch.from && patch.from.side != null) {
      next.from.side = normalizeSide(patch.from.side, next.from.side);
    }
    if (patch.to && patch.to.elementId && getElement(patch.to.elementId)) {
      next.to.elementId = patch.to.elementId;
    }
    if (patch.to && patch.to.side != null) {
      next.to.side = normalizeSide(patch.to.side, next.to.side);
    }
    if (patch.metadata && typeof patch.metadata === 'object') {
      next.metadata = model.normalizeMetadata(patch.metadata);
    }
    if (next.from.elementId === next.to.elementId) return connection;

    var opts = options || {};
    mutate(function (board) {
      for (var i = 0; i < board.connections.length; i += 1) {
        if (board.connections[i].id === id) {
          board.connections[i] = next;
          break;
        }
      }
    }, {
      label: opts.label || 'Edit connection',
      coalesce: opts.coalesce || null
    });

    return getConnection(id);
  }

  function swapConnection(id) {
    var connection = getConnection(id);
    if (!connection) return false;
    mutate(function (board) {
      for (var i = 0; i < board.connections.length; i += 1) {
        if (board.connections[i].id !== id) continue;
        var target = board.connections[i];
        var previousFrom = target.from;
        target.from = target.to;
        target.to = previousFrom;
        break;
      }
    }, { label: 'Swap connection direction' });
    return true;
  }

  function removeConnection(id) {
    var connection = getConnection(id);
    if (!connection) return false;
    mutate(function (board) {
      board.connections = board.connections.filter(function (conn) {
        return conn.id !== id;
      });
    }, { label: 'Delete connection' });
    if (selectedConnectionId === id) {
      selectedConnectionId = null;
      emit('selection');
    }
    return true;
  }

  function moveElements(positions, patches, options) {
    if ((!positions || !positions.length) && (!patches || !patches.length)) return;
    var opts = options || {};
    var byId = Object.create(null);
    (positions || []).forEach(function (pos) {
      if (!pos || !pos.id) return;
      byId[pos.id] = { id: pos.id, x: Math.round(pos.x), y: Math.round(pos.y) };
    });

    /*
     * Moving one member of a group moves the whole group. Drag sessions already
     * send every member; this also covers nudges and programmatic moves.
     */
    var originals = Object.create(null);
    var elements = getElements();
    elements.forEach(function (el) { originals[el.id] = el; });
    (positions || []).forEach(function (pos) {
      if (!pos || !pos.id) return;
      var element = originals[pos.id];
      if (!element || !element.groupId) return;
      var group = getGroup(element.groupId);
      if (!group) return;
      var target = byId[element.id];
      if (!target) return;
      var dx = target.x - element.x;
      var dy = target.y - element.y;
      group.elementIds.forEach(function (memberId) {
        if (byId[memberId]) return;
        var member = originals[memberId];
        if (!member) return;
        byId[memberId] = { id: memberId, x: member.x + dx, y: member.y + dy };
      });
    });

    var patchById = Object.create(null);
    (patches || []).forEach(function (entry) {
      if (entry && entry.id && entry.patch) patchById[entry.id] = entry.patch;
    });
    mutate(function (board) {
      board.elements.forEach(function (el) {
        var pos = byId[el.id];
        if (pos) {
          el.x = Math.round(pos.x);
          el.y = Math.round(pos.y);
        }
        if (patchById[el.id]) {
          Object.keys(patchById[el.id]).forEach(function (key) {
            if (key === 'id' || key === 'type' || key === 'groupId') return;
            el[key] = patchById[el.id][key];
          });
        }
        if (pos || patchById[el.id]) el.updatedAt = model.nowISO();
      });
    }, {
      label: opts.label || 'Move',
      coalesce: opts.coalesce || null
    });
  }

  function setViewport(viewport) {
    if (!project || !viewport) return;
    project.board.viewport = {
      x: Number(viewport.x) || 0,
      y: Number(viewport.y) || 0,
      zoom: Number(viewport.zoom) || 1
    };
  }

  function getViewport() {
    return project ? project.board.viewport : { x: 0, y: 0, zoom: 1 };
  }

  function updateSettings(patch, options) {
    if (!patch || typeof patch !== 'object') return;
    var opts = options || {};
    mutate(function (board) {
      board.settings = Object.assign({}, board.settings, patch);
    }, {
      label: 'Board settings',
      history: opts.history !== false,
      coalesce: opts.coalesce || null
    });
  }

  function setProjectMeta(patch) {
    if (!project || !patch) return;
    if (patch.name != null) {
      var name = String(patch.name);
      project.name = name;
    }
    if (patch.description != null) project.description = String(patch.description);
    if (patch.version != null) project.version = String(patch.version);
    if (patch.metadata && typeof patch.metadata === 'object') project.metadata = model.normalizeMetadata(patch.metadata);
    project.updatedAt = model.nowISO();
    dirty = true;
    emit('meta');
  }

  function replaceProject(nextProject) {
    project = nextProject;
    selection = new Set();
    selectedConnectionId = null;
    dirty = true;
    savedAt = null;
    history.clear();
    history = new ESB.SnapshotHistory({
      limit: 60,
      getCurrent: function () {
        return model.boardSnapshot(project.board);
      },
      onRestore: function (board) {
        project.board = board;
        pruneSelection();
        dirty = true;
        emit('restore');
      }
    });
    emit('load');
  }

  function undo() {
    var ok = history.undo();
    if (ok) {
      dirty = true;
      emit('selection');
    }
    return ok;
  }

  function redo() {
    var ok = history.redo();
    if (ok) {
      dirty = true;
      emit('selection');
    }
    return ok;
  }

  function canUndo() { return history ? history.canUndo() : false; }
  function canRedo() { return history ? history.canRedo() : false; }
  function undoLabel() { return history ? history.lastLabel() : ''; }

  function isDirty() { return dirty; }

  function markSaved(timestamp) {
    dirty = false;
    savedAt = timestamp === undefined ? model.nowISO() : (timestamp || null);
    emit('saved');
  }

  function getSavedAt() { return savedAt; }

  function getStats() {
    var counts = {};
    model.TYPE_ORDER.forEach(function (type) { counts[type] = 0; });
    var elements = getElements();
    elements.forEach(function (el) {
      if (counts[el.type] != null) counts[el.type] += 1;
    });
    return {
      elements: elements.length,
      connections: getConnections().length,
      contexts: counts.boundedContext,
      groups: getGroups().length,
      counts: counts
    };
  }

  function getContainers() {
    return getElements().filter(function (el) { return el.type === 'boundedContext'; });
  }

  function nextZ() {
    return model.nextZ(getElements());
  }

  ESB.store = {
    init: init,
    onChange: onChange,
    getProject: getProject,
    getBoard: getBoard,
    getElements: getElements,
    getConnections: getConnections,
    getElement: getElement,
    getConnection: getConnection,
    getGroups: getGroups,
    getGroup: getGroup,
    getGroupMemberIds: getGroupMemberIds,
    getGroupMembers: getGroupMembers,
    getGroupForElement: getGroupForElement,
    getGroupForSelection: getGroupForSelection,
    isGroupSelected: isGroupSelected,
    groupElements: groupElements,
    ungroupElements: ungroupElements,
    renameGroup: renameGroup,
    removeGroup: removeGroup,
    selectGroup: selectGroup,
    getSelection: getSelection,
    getSelectedElements: getSelectedElements,
    getSelectedConnectionId: getSelectedConnectionId,
    getSelectedConnection: getSelectedConnection,
    isSelected: isSelected,
    select: select,
    selectConnection: selectConnection,
    clearConnectionSelection: clearConnectionSelection,
    toggleSelection: toggleSelection,
    toggleElements: toggleElements,
    clearSelection: clearSelection,
    selectAll: selectAll,
    addConnection: addConnection,
    updateConnection: updateConnection,
    swapConnection: swapConnection,
    removeConnection: removeConnection,
    updateElement: updateElement,
    addElement: addElement,
    addElementObject: addElementObject,
    removeElements: removeElements,
    duplicateElements: duplicateElements,
    moveElements: moveElements,
    updateSettings: updateSettings,
    setProjectMeta: setProjectMeta,
    replaceProject: replaceProject,
    getViewport: getViewport,
    setViewport: setViewport,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    undoLabel: undoLabel,
    isDirty: isDirty,
    markSaved: markSaved,
    getSavedAt: getSavedAt,
    getStats: getStats,
    getContainers: getContainers,
    nextZ: nextZ,
    emit: emit
  };
})(window);
