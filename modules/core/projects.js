/*
 * Event Storm Board — local project storage.
 * Every project is stored under its own key so one large board cannot corrupt the index.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;

  var INDEX_KEY = 'esb:v1:index';
  var CURRENT_KEY = 'esb:v1:current';
  var PROJECT_PREFIX = 'esb:v1:project:';

  function projectKey(id) {
    return PROJECT_PREFIX + id;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function asText(value, fallback) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  function asCount(value) {
    var num = Number(value);
    return isFinite(num) && num >= 0 ? Math.round(num) : 0;
  }

  function byteLength(value) {
    var text = String(value == null ? '' : value);
    if (typeof global.TextEncoder === 'function') {
      try { return new global.TextEncoder().encode(text).length; } catch (err) { /* fall through */ }
    }
    return text.length * 2;
  }

  function storageAvailable() {
    try {
      var probe = '__esb_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  function listStorageKeys() {
    var keys = [];
    try {
      for (var i = 0; i < global.localStorage.length; i += 1) {
        var key = global.localStorage.key(i);
        if (typeof key === 'string') keys.push(key);
      }
    } catch (err) {
      console.warn('Could not enumerate browser storage.', err);
    }
    return keys;
  }

  function isEsbKey(key) {
    return key === INDEX_KEY || key === CURRENT_KEY || key.indexOf(PROJECT_PREFIX) === 0;
  }

  function sanitizeIndexEntry(entry) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id) return null;
    return {
      id: entry.id,
      name: asText(entry.name, 'Untitled Board') || 'Untitled Board',
      description: asText(entry.description, ''),
      version: asText(entry.version, '1.0.0'),
      createdAt: asText(entry.createdAt, ''),
      updatedAt: asText(entry.updatedAt, ''),
      savedAt: asText(entry.savedAt, entry.updatedAt || entry.createdAt || ''),
      elementCount: asCount(entry.elementCount),
      connectionCount: asCount(entry.connectionCount),
      groupCount: asCount(entry.groupCount),
      bytes: asCount(entry.bytes)
    };
  }

  /*
   * The project list is a convenience index, not the source of truth.
   * readIndexState reports when it is unreadable so Storage can rebuild it
   * from the independently stored project records.
   */
  function readIndexState() {
    if (!storageAvailable()) {
      return { version: 1, projects: [], corrupt: false, bytes: 0 };
    }
    var raw;
    try {
      raw = global.localStorage.getItem(INDEX_KEY);
    } catch (err) {
      return { version: 1, projects: [], corrupt: true, bytes: 0 };
    }
    if (!raw) return { version: 1, projects: [], corrupt: false, bytes: 0 };

    var bytes = byteLength(raw);
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) {
        return { version: 1, projects: [], corrupt: true, bytes: bytes };
      }
      var seen = Object.create(null);
      var projects = [];
      parsed.projects.forEach(function (entry) {
        var clean = sanitizeIndexEntry(entry);
        if (!clean || seen[clean.id]) return;
        seen[clean.id] = true;
        projects.push(clean);
      });
      return { version: 1, projects: projects, corrupt: false, bytes: bytes };
    } catch (err) {
      console.warn('Could not read the project index.', err);
      return { version: 1, projects: [], corrupt: true, bytes: bytes };
    }
  }

  function readIndex() {
    return readIndexState().projects;
  }

  function writeIndex(index) {
    global.localStorage.setItem(INDEX_KEY, JSON.stringify({ version: 1, projects: index.projects }));
  }

  function buildSummary(project, savedAt, bytes) {
    var board = project.board || {};
    return {
      id: project.id,
      name: project.name,
      description: project.description || '',
      version: project.version || '1.0.0',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      savedAt: savedAt || project.updatedAt || new Date().toISOString(),
      elementCount: Array.isArray(board.elements) ? board.elements.length : 0,
      connectionCount: Array.isArray(board.connections) ? board.connections.length : 0,
      groupCount: Array.isArray(board.groups) ? board.groups.length : 0,
      bytes: asCount(bytes)
    };
  }

  function upsertIndexEntry(project, savedAt, bytes) {
    var index = readIndexState();
    var summary = buildSummary(project, savedAt, bytes);
    var found = false;
    index.projects = index.projects.map(function (entry) {
      if (entry.id === project.id) {
        found = true;
        return summary;
      }
      return entry;
    });
    if (!found) index.projects.push(summary);
    index.projects.sort(function (a, b) {
      return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
    });
    writeIndex(index);
    return summary;
  }

  function saveProject(project, options) {
    var opts = options || {};
    if (!storageAvailable()) {
      throw new Error('Browser storage is unavailable. Your browser may be in private mode or blocking site data. Use Export to keep your work.');
    }
    if (!project || !project.id) throw new Error('Cannot save a project without an id.');
    project.updatedAt = new Date().toISOString();

    var payload = JSON.stringify(model.emptyEnvelope(project));
    try {
      global.localStorage.setItem(projectKey(project.id), payload);
    } catch (err) {
      var sizeKb = Math.round(payload.length / 1024);
      throw new Error('Storage is full while saving this ' + sizeKb + ' KB board. Export the project to JSON, then open Storage in the toolbar to remove older projects.');
    }
    if (!opts.skipCurrent) setCurrentId(project.id);
    return upsertIndexEntry(project, new Date().toISOString(), byteLength(payload));
  }

  function readStoredProject(key, id) {
    var raw;
    try {
      raw = global.localStorage.getItem(key);
    } catch (err) {
      return { ok: false, bytes: 0, error: 'Browser storage could not be read.' };
    }
    if (raw == null) return { ok: false, bytes: 0, error: 'Project data is missing.' };

    var bytes = byteLength(raw);
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { ok: false, bytes: bytes, error: 'Stored JSON is unreadable.' };
    }

    var candidate = isObject(parsed) && isObject(parsed.project) ? parsed.project : parsed;
    if (!isObject(candidate) || !isObject(candidate.board)) {
      return { ok: false, bytes: bytes, error: 'Stored data is not a project record.' };
    }

    if (ESB.validate && ESB.validate.validateProjectFile) {
      var result = ESB.validate.validateProjectFile(parsed);
      if (!result.ok) {
        return {
          ok: false,
          bytes: bytes,
          error: result.errors[0] || 'Stored project failed validation.'
        };
      }
      candidate = result.project;
    }

    return {
      ok: true,
      bytes: bytes,
      project: candidate,
      idMismatch: candidate.id !== id
    };
  }

  function projectSummary(project, id, bytes, status, indexEntry) {
    var board = project.board || {};
    return {
      id: id,
      name: project.name || (indexEntry && indexEntry.name) || 'Untitled Board',
      status: status,
      current: false,
      bytes: asCount(bytes),
      elementCount: Array.isArray(board.elements) ? board.elements.length : 0,
      connectionCount: Array.isArray(board.connections) ? board.connections.length : 0,
      groupCount: Array.isArray(board.groups) ? board.groups.length : 0,
      savedAt: (indexEntry && indexEntry.savedAt) || project.updatedAt || null,
      updatedAt: project.updatedAt || null,
      error: null
    };
  }

  /*
   * Full storage scan: merges the index with the actual per-project records so
   * the UI can show orphans, missing entries and unreadable data.
   */
  function scanStorage() {
    var indexState = readIndexState();
    var indexById = Object.create(null);
    indexState.projects.forEach(function (entry) { indexById[entry.id] = entry; });

    var keys = listStorageKeys();
    var storedById = Object.create(null);
    var projectBytes = 0;
    var currentBytes = 0;
    var totalBytes = 0;

    keys.forEach(function (key) {
      var raw = '';
      try {
        raw = global.localStorage.getItem(key) || '';
      } catch (err) {
        raw = '';
      }
      var bytes = byteLength(raw);
      totalBytes += byteLength(key) + bytes;

      if (key === CURRENT_KEY) currentBytes = bytes;
      if (key.indexOf(PROJECT_PREFIX) !== 0) return;

      var id = key.slice(PROJECT_PREFIX.length);
      var record = readStoredProject(key, id);
      record.key = key;
      record.id = id;
      storedById[id] = record;
      projectBytes += record.bytes || 0;
    });

    var currentId = getCurrentId();
    var projects = [];
    var seen = Object.create(null);

    indexState.projects.forEach(function (entry) {
      seen[entry.id] = true;
      var stored = storedById[entry.id];
      if (stored && stored.ok) {
        projects.push(projectSummary(stored.project, entry.id, stored.bytes, 'ok', entry));
        return;
      }
      projects.push({
        id: entry.id,
        name: entry.name,
        status: stored ? 'corrupt' : 'missing',
        current: false,
        bytes: stored ? stored.bytes : 0,
        elementCount: entry.elementCount,
        connectionCount: entry.connectionCount,
        groupCount: entry.groupCount,
        savedAt: entry.savedAt,
        updatedAt: entry.updatedAt,
        error: stored ? stored.error : 'Project data is missing from this browser.'
      });
    });

    Object.keys(storedById).forEach(function (id) {
      if (seen[id]) return;
      var stored = storedById[id];
      if (stored.ok) {
        projects.push(projectSummary(stored.project, id, stored.bytes, 'orphan', null));
      } else {
        projects.push({
          id: id,
          name: '(unreadable project)',
          status: 'corrupt',
          current: false,
          bytes: stored.bytes || 0,
          elementCount: 0,
          connectionCount: 0,
          groupCount: 0,
          savedAt: null,
          updatedAt: null,
          error: stored.error || 'Stored project could not be read.'
        });
      }
    });

    projects.forEach(function (entry) {
      entry.current = entry.id === currentId;
      var stored = storedById[entry.id];
      entry.idMismatch = Boolean(stored && stored.ok && stored.idMismatch);
    });

    var currentValid = Boolean(currentId && storedById[currentId] && storedById[currentId].ok);
    var orphanCount = projects.filter(function (entry) { return entry.status === 'orphan'; }).length;
    var missingCount = projects.filter(function (entry) { return entry.status === 'missing'; }).length;
    var corruptCount = projects.filter(function (entry) { return entry.status === 'corrupt'; }).length;
    var mismatchCount = projects.filter(function (entry) { return entry.idMismatch; }).length;
    var issueCount = (indexState.corrupt ? 1 : 0) + orphanCount + missingCount + corruptCount + mismatchCount +
      (currentId && !currentValid ? 1 : 0);

    return {
      info: {
        available: storageAvailable(),
        indexCorrupt: indexState.corrupt,
        indexBytes: indexState.bytes,
        currentBytes: currentBytes,
        projectBytes: projectBytes,
        esbBytes: indexState.bytes + currentBytes + projectBytes,
        totalBytes: totalBytes,
        indexCount: indexState.projects.length,
        storedCount: Object.keys(storedById).length,
        projectCount: projects.length,
        orphanCount: orphanCount,
        missingCount: missingCount,
        corruptCount: corruptCount,
        mismatchCount: mismatchCount,
        issueCount: issueCount,
        currentId: currentId,
        currentValid: currentValid,
        projects: projects,
        checkedAt: new Date().toISOString()
      },
      storedById: storedById,
      indexById: indexById
    };
  }

  function getStorageInfo() {
    return scanStorage().info;
  }

  /*
   * Rebuilds the index from the project records themselves.
   * Unreadable project records cannot be opened again and are removed.
   */
  function repairStorage() {
    if (!storageAvailable()) {
      throw new Error('Browser storage is unavailable, so there is nothing to repair.');
    }

    var scan = scanStorage();
    var summaries = [];
    var recovered = 0;
    var removedCorrupt = 0;
    var droppedEntries = 0;
    var rewritten = 0;

    Object.keys(scan.storedById).forEach(function (id) {
      var record = scan.storedById[id];
      if (!record.ok) {
        try {
          global.localStorage.removeItem(record.key);
          removedCorrupt += 1;
        } catch (err) { /* leave it for the next attempt */ }
        return;
      }

      var project = record.project;
      if (project.id !== id) {
        project = model.clone(project);
        project.id = id;
        try {
          global.localStorage.setItem(record.key, JSON.stringify(model.emptyEnvelope(project)));
          rewritten += 1;
        } catch (err) { /* the record is still usable in memory */ }
      }

      var indexed = scan.indexById[id];
      if (!indexed) recovered += 1;
      summaries.push(buildSummary(project, indexed && indexed.savedAt, record.bytes));
    });

    Object.keys(scan.indexById).forEach(function (id) {
      if (!scan.storedById[id]) droppedEntries += 1;
    });

    summaries.sort(function (a, b) {
      return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
    });
    writeIndex({ projects: summaries });

    var currentId = getCurrentId();
    var currentExists = summaries.some(function (entry) { return entry.id === currentId; });
    if (!currentExists) {
      currentId = summaries.length ? summaries[0].id : null;
      if (currentId) setCurrentId(currentId);
      else {
        try { global.localStorage.removeItem(CURRENT_KEY); } catch (err) { /* ignore */ }
      }
    }

    return {
      recovered: recovered,
      removedCorrupt: removedCorrupt,
      droppedEntries: droppedEntries,
      rewritten: rewritten,
      projectCount: summaries.length,
      currentId: currentId
    };
  }

  function clearAll() {
    if (!storageAvailable()) return { removed: 0, bytes: 0 };
    var removed = 0;
    var bytes = 0;
    listStorageKeys().forEach(function (key) {
      if (!isEsbKey(key)) return;
      try {
        bytes += byteLength(global.localStorage.getItem(key) || '');
        global.localStorage.removeItem(key);
        removed += 1;
      } catch (err) { /* continue removing the rest */ }
    });
    return { removed: removed, bytes: bytes };
  }

  function loadProject(id) {
    if (!storageAvailable()) throw new Error('Browser storage is unavailable.');
    var raw = global.localStorage.getItem(projectKey(id));
    if (!raw) throw new Error('That project could not be found in this browser.');
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error('Stored project data is corrupted and could not be parsed.');
    }
    if (ESB.validate && ESB.validate.validateProjectFile) {
      var result = ESB.validate.validateProjectFile(parsed);
      if (!result.ok) {
        throw new Error('Stored project failed validation: ' + result.errors[0]);
      }
      return result.project;
    }
    return parsed.project;
  }

  function deleteProject(id) {
    if (!storageAvailable()) return;
    global.localStorage.removeItem(projectKey(id));
    var index = readIndexState();
    index.projects = index.projects.filter(function (entry) { return entry.id !== id; });
    writeIndex(index);
    if (getCurrentId() === id) {
      global.localStorage.removeItem(CURRENT_KEY);
    }
  }

  function hasProject(id) {
    if (!id) return false;
    if (!storageAvailable()) {
      return listProjects().some(function (entry) { return entry.id === id; });
    }
    try {
      if (global.localStorage.getItem(projectKey(id)) != null) return true;
    } catch (err) { /* fall back to the index */ }
    return listProjects().some(function (entry) { return entry.id === id; });
  }

  function setCurrentId(id) {
    try {
      global.localStorage.setItem(CURRENT_KEY, id);
    } catch (err) {
      /* Non-fatal: the board still works for this session. */
    }
  }

  function getCurrentId() {
    try {
      return global.localStorage.getItem(CURRENT_KEY);
    } catch (err) {
      return null;
    }
  }

  function loadCurrent() {
    var id = getCurrentId();
    if (!id) return null;
    try {
      return loadProject(id);
    } catch (err) {
      console.warn('Could not restore the last project.', err);
      return null;
    }
  }

  function listProjects() {
    return readIndex();
  }

  function latestSavedAt() {
    var list = listProjects();
    if (!list.length) return null;
    return list.reduce(function (latest, entry) {
      if (!latest) return entry.savedAt || entry.updatedAt || null;
      var value = entry.savedAt || entry.updatedAt;
      return value && value > latest ? value : latest;
    }, null);
  }

  function getSummary(projectId) {
    var list = listProjects();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === projectId) return list[i];
    }
    return null;
  }

  ESB.projects = {
    available: storageAvailable,
    list: listProjects,
    load: loadProject,
    loadCurrent: loadCurrent,
    save: saveProject,
    remove: deleteProject,
    has: hasProject,
    setCurrentId: setCurrentId,
    getCurrentId: getCurrentId,
    getSummary: getSummary,
    latestSavedAt: latestSavedAt,
    getStorageInfo: getStorageInfo,
    repair: repairStorage,
    clearAll: clearAll,
    keys: {
      index: INDEX_KEY,
      current: CURRENT_KEY,
      projectPrefix: PROJECT_PREFIX
    }
  };
})(window);
