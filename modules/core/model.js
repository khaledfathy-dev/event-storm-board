/*
 * Event Storm Board — domain model
 * Pure data definitions shared by the board, persistence and every exporter.
 * No DOM access in this file.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});

  var APP_ID = 'event-storm-board';
  var SCHEMA_VERSION = '1.0.0';

  var TYPES = {
    domainEvent: {
      label: 'Domain Event',
      plural: 'Domain Events',
      color: '#F2A03D',
      size: [190, 92],
      min: [130, 64],
      placeholder: 'Order Placed',
      hint: 'Something that happened',
      workflow: 1
    },
    command: {
      label: 'Command',
      plural: 'Commands',
      color: '#2563EB',
      size: [190, 92],
      min: [130, 64],
      placeholder: 'Place Order',
      hint: 'An intent to change state',
      workflow: 2
    },
    aggregate: {
      label: 'Aggregate',
      plural: 'Aggregates',
      color: '#EFC94C',
      size: [200, 100],
      min: [140, 68],
      placeholder: 'Order',
      hint: 'Consistency boundary',
      workflow: 4
    },
    actor: {
      label: 'Actor',
      plural: 'Actors',
      color: '#FBE7A1',
      size: [156, 80],
      min: [110, 56],
      placeholder: 'Customer',
      hint: 'A person or role',
      workflow: 3
    },
    externalSystem: {
      label: 'External System',
      plural: 'External Systems',
      color: '#F3A6C8',
      size: [184, 88],
      min: [130, 60],
      placeholder: 'Payment Gateway',
      hint: 'Outside your boundary',
      workflow: 6
    },
    policy: {
      label: 'Policy / Process',
      plural: 'Policies',
      color: '#C4A2F2',
      size: [200, 92],
      min: [140, 64],
      placeholder: 'Whenever order is placed…',
      hint: 'Reactive business rule',
      workflow: 5
    },
    readModel: {
      label: 'Read Model',
      plural: 'Read Models',
      color: '#8FD3A0',
      size: [184, 92],
      min: [130, 64],
      placeholder: 'Order Summary',
      hint: 'Data used to decide',
      workflow: 7
    },
    boundedContext: {
      label: 'Bounded Context',
      plural: 'Bounded Contexts',
      color: '#DBEAF9',
      size: [440, 300],
      min: [240, 160],
      placeholder: 'Checkout Context',
      hint: 'Container for a subdomain',
      workflow: 9,
      container: true
    },
    hotspot: {
      label: 'Hotspot / Question',
      plural: 'Hotspots',
      color: '#F07C6C',
      size: [176, 88],
      min: [120, 60],
      placeholder: 'Who owns pricing?',
      hint: 'Conflict or open question',
      workflow: 8
    },
    note: {
      label: 'Note',
      plural: 'Notes',
      color: '#FFFFFF',
      size: [200, 116],
      min: [120, 64],
      placeholder: 'Workshop note',
      hint: 'Free-form annotation',
      workflow: 8
    }
  };

  var TYPE_ORDER = [
    'domainEvent',
    'command',
    'actor',
    'aggregate',
    'policy',
    'readModel',
    'externalSystem',
    'boundedContext',
    'hotspot',
    'note'
  ];

  var DEFAULT_SETTINGS = {
    grid: true,
    gridSize: 20,
    snap: true,
    minimap: true,
    showConnectionLabels: true
  };

  var CONNECTION_TYPES = {
    flow: { label: 'Flow', color: '#64748B', style: 'solid' },
    association: { label: 'Association', color: '#94A3B8', style: 'dashed' },
    'policy-link': { label: 'Policy link', color: '#8B5CF6', style: 'solid' }
  };

  var CONNECTION_STYLES = {
    solid: 'Solid',
    dashed: 'Dashed'
  };

  var CONNECTION_SIDES = ['auto', 'top', 'right', 'bottom', 'left'];

  var idCounter = 0;
  var listeners = new Set();

  function nowISO() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    var random;
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      random = global.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    } else {
      random = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    }
    idCounter = (idCounter + 1) % 46656;
    return String(prefix) + '_' + Date.now().toString(36) + idCounter.toString(36) + random;
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof global.structuredClone === 'function') {
      try { return global.structuredClone(value); } catch (err) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function isType(type) {
    return Object.prototype.hasOwnProperty.call(TYPES, type);
  }

  function typeInfo(type) {
    return isType(type) ? TYPES[type] : null;
  }

  function defaultTitle(type) {
    var info = typeInfo(type);
    return info ? info.placeholder : 'Untitled';
  }

  function createElement(type, x, y, overrides) {
    var info = typeInfo(type);
    if (!info) throw new Error('Unknown element type: ' + type);

    var base = {
      id: uid('el'),
      type: type,
      title: defaultTitle(type),
      description: '',
      businessRules: '',
      notes: '',
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0),
      width: info.size[0],
      height: info.size[1],
      z: info.container ? 0 : 1,
      color: null,
      contextId: null,
      groupId: null,
      metadata: {},
      createdAt: nowISO(),
      updatedAt: nowISO()
    };

    if (overrides && typeof overrides === 'object') {
      Object.keys(overrides).forEach(function (key) {
        base[key] = overrides[key];
      });
    }
    if (overrides && overrides.metadata) {
      base.metadata = normalizeMetadata(overrides.metadata);
    }
    return base;
  }

  function createProject(name) {
    var created = nowISO();
    return {
      id: uid('prj'),
      name: (name && String(name).trim()) || 'Untitled Board',
      description: '',
      version: '1.0.0',
      createdAt: created,
      updatedAt: created,
      metadata: {},
      board: {
        elements: [],
        connections: [],
        groups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        settings: clone(DEFAULT_SETTINGS)
      }
    };
  }

  function emptyEnvelope(project) {
    return {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowISO(),
      project: clone(project)
    };
  }

  function boardSnapshot(board) {
    return {
      elements: clone(board.elements || []),
      connections: clone(board.connections || []),
      groups: clone(board.groups || []),
      settings: clone(board.settings || DEFAULT_SETTINGS)
    };
  }

  function contentBounds(elements) {
    var list = (elements || []).filter(function (el) {
      return isFinite(el.x) && isFinite(el.y);
    });
    if (!list.length) return null;

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    list.forEach(function (el) {
      var w = Number(el.width) || 0;
      var h = Number(el.height) || 0;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w);
      maxY = Math.max(maxY, el.y + h);
    });

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  function hexToRgb(hex) {
    var value = String(hex || '').replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function luminance(parts) {
    function channel(value) {
      var c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(parts.r) + 0.7152 * channel(parts.g) + 0.0722 * channel(parts.b);
  }

  /* WCAG 2.1 contrast ratio between two hex colours. Used by tests and ink picking. */
  function contrastRatio(foreground, background) {
    var a = hexToRgb(foreground);
    var b = hexToRgb(background);
    if (!a || !b) return 1;
    var first = luminance(a);
    var second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function contrastInk(hex) {
    if (!hexToRgb(hex)) return '#101828';
    return contrastRatio('#141B26', hex) >= contrastRatio('#FFFFFF', hex) ? '#141B26' : '#FFFFFF';
  }

  function withAlpha(hex, alpha) {
    var rgb = hexToRgb(hex);
    if (!rgb) return 'rgba(16, 24, 40, ' + alpha + ')';
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  /*
   * Metadata is user-defined, so keys and values are bounded and reserved
   * prototype keys are rejected before the object is stored or rendered.
   */
  function normalizeMetadata(input) {
    var result = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
    var keys = Object.keys(input).slice(0, 40);
    keys.forEach(function (key) {
      var cleanKey = String(key).replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!cleanKey) return;
      if (cleanKey === '__proto__' || cleanKey === 'constructor' || cleanKey === 'prototype') return;
      var value = input[key];
      if (value == null) return;
      result[cleanKey] = String(value).slice(0, 500);
    });
    return result;
  }

  function normalizeColor(value) {
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    return null;
  }

  function nextZ(elements) {
    var max = 0;
    (elements || []).forEach(function (el) {
      var z = Number(el.z);
      if (isFinite(z)) max = Math.max(max, z);
    });
    return max + 1;
  }

  function sortForRender(elements) {
    return (elements || []).slice().sort(function (a, b) {
      var ac = a.type === 'boundedContext' ? 0 : 1;
      var bc = b.type === 'boundedContext' ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return (Number(a.z) || 0) - (Number(b.z) || 0);
    });
  }

  function findContextForPoint(elements, point) {
    var matches = (elements || []).filter(function (el) {
      if (el.type !== 'boundedContext') return false;
      return point.x >= el.x && point.x <= el.x + el.width &&
        point.y >= el.y && point.y <= el.y + el.height;
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return (a.width * a.height) - (b.width * b.height);
    });
    return matches[0];
  }

  function compareVersions(a, b) {
    var pa = String(a).split('.').map(Number);
    var pb = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      var left = pa[i] || 0;
      var right = pb[i] || 0;
      if (left > right) return 1;
      if (left < right) return -1;
    }
    return 0;
  }

  function on(event, handler) {
    listeners.add(handler);
    return function () { listeners.delete(handler); };
  }

  ESB.model = {
    APP_ID: APP_ID,
    SCHEMA_VERSION: SCHEMA_VERSION,
    TYPES: TYPES,
    TYPE_ORDER: TYPE_ORDER,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    CONNECTION_TYPES: CONNECTION_TYPES,
    CONNECTION_STYLES: CONNECTION_STYLES,
    CONNECTION_SIDES: CONNECTION_SIDES,
    uid: uid,
    clone: clone,
    nowISO: nowISO,
    isType: isType,
    typeInfo: typeInfo,
    defaultTitle: defaultTitle,
    createElement: createElement,
    createProject: createProject,
    emptyEnvelope: emptyEnvelope,
    boardSnapshot: boardSnapshot,
    contentBounds: contentBounds,
    contrastInk: contrastInk,
    contrastRatio: contrastRatio,
    withAlpha: withAlpha,
    normalizeColor: normalizeColor,
    normalizeMetadata: normalizeMetadata,
    nextZ: nextZ,
    sortForRender: sortForRender,
    findContextForPoint: findContextForPoint,
    compareVersions: compareVersions,
    on: on
  };
})(window);
