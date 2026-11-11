/*
 * Event Storm Board — import validation and normalisation.
 * Never mutates the incoming object; returns a clean project or a list of errors.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;

  function normalizeSide(value) {
    return model.CONNECTION_SIDES.indexOf(value) >= 0 ? value : 'auto';
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function asString(value, fallback) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  function asNumber(value, fallback) {
    var num = typeof value === 'number' ? value : Number(value);
    return isFinite(num) ? num : fallback;
  }

  function metadataNeedsRepair(input, clean) {
    var keys = Object.keys(input);
    if (keys.length > 40 || keys.length !== Object.keys(clean).length) return true;
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var cleanKey = String(key).replace(/\s+/g, ' ').trim().slice(0, 60);
      if (cleanKey !== key) return true;
      if (input[key] == null) return true;
      if (clean[cleanKey] !== String(input[key]).slice(0, 500)) return true;
    }
    return false;
  }

  function importMetadata(input, label, warnings) {
    var clean = model.normalizeMetadata(input);
    if (isObject(input) && metadataNeedsRepair(input, clean)) {
      warnings.push(label + ': custom metadata was normalised (maximum 40 fields, keys trimmed to 60 characters and values to 500).');
    }
    return clean;
  }

  function validateProjectFile(input) {
    var errors = [];
    var warnings = [];
    var maxErrors = 40;

    function fail(message) {
      if (errors.length < maxErrors) errors.push(message);
    }

    if (!isObject(input)) {
      return {
        ok: false,
        errors: ['The file does not contain a JSON object. Expected an Event Storm Board project export.'],
        warnings: warnings,
        project: null
      };
    }

    var envelope = input;
    var isEnvelope = Object.prototype.hasOwnProperty.call(input, 'app');

    if (isEnvelope) {
      if (input.app !== model.APP_ID) {
        fail('This file was not created by Event Storm Board (app marker: "' + String(input.app) + '").');
      }
      if (!input.schemaVersion) {
        warnings.push('Missing schemaVersion; assuming ' + model.SCHEMA_VERSION + '.');
      } else if (typeof input.schemaVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.schemaVersion)) {
        fail('Invalid schemaVersion "' + String(input.schemaVersion) + '". Expected a semantic version such as 1.0.0.');
      } else {
        var comparison = model.compareVersions(input.schemaVersion, model.SCHEMA_VERSION);
        var major = Number(input.schemaVersion.split('.')[0]);
        if (major !== 1) {
          fail('Unsupported schema version ' + input.schemaVersion + '. This build reads schema 1.x projects.');
        } else if (comparison > 0) {
          warnings.push('Project was saved with a newer 1.x schema (' + input.schemaVersion + '). Unknown fields are preserved but may not render.');
        }
      }
    } else {
      warnings.push('No application marker found; treating the file as a plain project document.');
    }

    var project = isEnvelope ? input.project : input;
    if (!isObject(project)) {
      fail('The export is missing its "project" object.');
      return { ok: false, errors: errors, warnings: warnings, project: null };
    }

    if (!isObject(project.board)) {
      fail('The project is missing a "board" object.');
      return { ok: false, errors: errors, warnings: warnings, project: null };
    }

    var board = project.board;
    if (!Array.isArray(board.elements)) fail('board.elements must be an array.');
    if (board.connections != null && !Array.isArray(board.connections)) fail('board.connections must be an array.');
    if (board.groups != null && !Array.isArray(board.groups)) fail('board.groups must be an array.');

    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, project: null };
    }

    var clean = {
      id: asString(project.id, ''),
      name: asString(project.name, '').trim(),
      description: asString(project.description, ''),
      version: asString(project.version, '1.0.0'),
      createdAt: asString(project.createdAt, model.nowISO()),
      updatedAt: asString(project.updatedAt, model.nowISO()),
      metadata: {},
      board: {
        elements: [],
        connections: [],
        groups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        settings: model.clone(model.DEFAULT_SETTINGS)
      }
    };

    if (!clean.id) {
      clean.id = model.uid('prj');
      warnings.push('Project had no id; a new one was generated.');
    }
    if (!clean.name) {
      clean.name = 'Imported Board';
      warnings.push('Project had no name; named "Imported Board".');
    }
    if (!clean.createdAt || isNaN(Date.parse(clean.createdAt))) clean.createdAt = model.nowISO();
    if (!clean.updatedAt || isNaN(Date.parse(clean.updatedAt))) clean.updatedAt = clean.createdAt;
    clean.metadata = importMetadata(project.metadata, 'Project', warnings);

    var seenIds = Object.create(null);
    var droppedElements = 0;

    board.elements.forEach(function (raw, index) {
      if (!isObject(raw)) {
        droppedElements += 1;
        return;
      }
      var type = asString(raw.type, '');
      if (!model.isType(type)) {
        fail('Element #' + (index + 1) + ' has unknown type "' + type + '".');
        return;
      }
      var info = model.typeInfo(type);
      var id = asString(raw.id, '');
      if (!id) {
        id = model.uid('el');
        warnings.push('Element #' + (index + 1) + ' had no id; a new one was generated.');
      }
      if (seenIds[id]) {
        fail('Duplicate element id "' + id + '". Every element must have a stable unique id.');
        return;
      }
      seenIds[id] = true;

      var width = asNumber(raw.width, info.size[0]);
      var height = asNumber(raw.height, info.size[1]);
      if (width < info.min[0] || height < info.min[1]) {
        width = Math.max(width, info.min[0]);
        height = Math.max(height, info.min[1]);
        warnings.push('Element "' + (raw.title || id) + '" was smaller than the minimum size and has been enlarged.');
      }

      var element = {
        id: id,
        type: type,
        title: asString(raw.title, '').slice(0, 200),
        description: asString(raw.description, ''),
        businessRules: asString(raw.businessRules, ''),
        notes: asString(raw.notes, ''),
        x: Math.round(asNumber(raw.x, 40)),
        y: Math.round(asNumber(raw.y, 40)),
        width: Math.round(width),
        height: Math.round(height),
        z: asNumber(raw.z, 1),
        color: model.normalizeColor(raw.color),
        contextId: raw.contextId == null ? null : asString(raw.contextId, null),
        groupId: raw.groupId == null ? null : asString(raw.groupId, null),
        metadata: {},
        createdAt: asString(raw.createdAt, model.nowISO()),
        updatedAt: asString(raw.updatedAt, model.nowISO())
      };

      if (isObject(raw.metadata)) {
        element.metadata = importMetadata(raw.metadata, 'Element "' + (element.title || id) + '"', warnings);
      }
      if (!element.title) element.title = model.defaultTitle(type);

      clean.board.elements.push(element);
    });

    if (droppedElements) {
      warnings.push(droppedElements + ' malformed element entr' + (droppedElements === 1 ? 'y was' : 'ies were') + ' skipped.');
    }

    var elementIds = Object.create(null);
    clean.board.elements.forEach(function (el) { elementIds[el.id] = true; });

    clean.board.elements.forEach(function (el) {
      if (el.contextId && el.contextId === el.id) el.contextId = null;
      if (el.contextId && !elementIds[el.contextId]) {
        el.contextId = null;
        warnings.push('Cleared a bounded context reference that pointed at a missing element (' + el.id + ').');
      }
      if (el.contextId) {
        var parent = clean.board.elements.find(function (el2) { return el2.id === el.contextId; });
        if (!parent || parent.type !== 'boundedContext') {
          el.contextId = null;
          warnings.push('Element "' + el.title + '" referenced a non-container context; the reference was cleared.');
        }
      }
    });

    var seenConnections = Object.create(null);
    var rawConnections = Array.isArray(board.connections) ? board.connections : [];
    var danglingConnections = 0;

    rawConnections.forEach(function (raw, index) {
      if (!isObject(raw)) {
        danglingConnections += 1;
        return;
      }
      var from = isObject(raw.from) ? raw.from : null;
      var to = isObject(raw.to) ? raw.to : null;
      var fromId = from && asString(from.elementId, '');
      var toId = to && asString(to.elementId, '');
      if (!fromId || !toId || !elementIds[fromId] || !elementIds[toId]) {
        danglingConnections += 1;
        return;
      }
      var id = asString(raw.id, '');
      if (!id) id = model.uid('cn');
      if (seenConnections[id]) {
        warnings.push('Duplicate connection id "' + id + '" was renamed.');
        id = model.uid('cn');
      }
      seenConnections[id] = true;

      var style = asString(raw.style, 'solid');
      var type = asString(raw.type, 'flow');
      if (!model.CONNECTION_TYPES[type]) type = 'flow';
      if (!model.CONNECTION_STYLES[style]) style = model.CONNECTION_TYPES[type].style;
      if (fromId === toId) {
        danglingConnections += 1;
        return;
      }
      clean.board.connections.push({
        id: id,
        from: { elementId: fromId, side: normalizeSide(from.side) },
        to: { elementId: toId, side: normalizeSide(to.side) },
        type: type,
        style: style,
        label: asString(raw.label, '').slice(0, 200),
        metadata: importMetadata(raw.metadata, 'Connection "' + id + '"', warnings)
      });
    });

    if (danglingConnections) {
      warnings.push(danglingConnections + ' connection' + (danglingConnections === 1 ? '' : 's') +
        ' referenced missing elements or linked an element to itself and could not be restored.');
    }

    var containerIds = Object.create(null);
    clean.board.elements.forEach(function (el) {
      if (el.type === 'boundedContext') containerIds[el.id] = true;
    });

    var rawGroups = Array.isArray(board.groups) ? board.groups : [];
    var seenGroups = Object.create(null);
    var claimedMembers = Object.create(null);
    var droppedGroups = 0;

    rawGroups.forEach(function (raw) {
      if (!isObject(raw)) {
        droppedGroups += 1;
        return;
      }
      var id = asString(raw.id, '');
      if (!id || seenGroups[id]) {
        droppedGroups += 1;
        return;
      }
      seenGroups[id] = true;

      var seenMembers = Object.create(null);
      var members = [];
      (Array.isArray(raw.elementIds) ? raw.elementIds : []).forEach(function (memberId) {
        if (typeof memberId !== 'string') return;
        if (!elementIds[memberId] || containerIds[memberId]) return;
        if (seenMembers[memberId] || claimedMembers[memberId]) return;
        seenMembers[memberId] = true;
        members.push(memberId);
      });

      if (members.length < 2) {
        droppedGroups += 1;
        return;
      }

      members.forEach(function (memberId) { claimedMembers[memberId] = id; });
      clean.board.groups.push({
        id: id,
        name: asString(raw.name, 'Group').slice(0, 80) || 'Group',
        elementIds: members
      });
    });

    /* board.groups is canonical; element.groupId is always rebuilt from it. */
    clean.board.elements.forEach(function (el) {
      el.groupId = claimedMembers[el.id] || null;
    });

    if (droppedGroups) {
      warnings.push(droppedGroups + ' group' + (droppedGroups === 1 ? ' was' : 's were') +
        ' dropped because ' + (droppedGroups === 1 ? 'it no longer had' : 'they no longer had') +
        ' at least two valid, non-container members.');
    }

    if (isObject(board.viewport)) {
      var zoom = asNumber(board.viewport.zoom, 1);
      clean.board.viewport = {
        x: asNumber(board.viewport.x, 0),
        y: asNumber(board.viewport.y, 0),
        zoom: Math.min(2.5, Math.max(0.2, zoom))
      };
    }

    if (isObject(board.settings)) {
      ['grid', 'snap', 'minimap', 'showConnectionLabels'].forEach(function (key) {
        if (typeof board.settings[key] === 'boolean') {
          clean.board.settings[key] = board.settings[key];
        }
      });
      var gridSize = asNumber(board.settings.gridSize, clean.board.settings.gridSize);
      clean.board.settings.gridSize = Math.min(64, Math.max(4, Math.round(gridSize)));
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      project: errors.length === 0 ? clean : null
    };
  }

  ESB.validate = {
    validateProjectFile: validateProjectFile
  };
})(window);
