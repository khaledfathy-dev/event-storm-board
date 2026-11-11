/*
 * Event Storm Board — JSON project import and export.
 * The JSON envelope is the canonical interchange format for the whole app.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;
  var MAX_FILE_BYTES = 25 * 1024 * 1024;

  function showErrors(title, errors) {
    var list = document.createElement('ul');
    list.className = 'modal__list';
    errors.forEach(function (message) {
      var li = document.createElement('li');
      li.textContent = message;
      list.appendChild(li);
    });
    return ESB.ui.modal({
      title: title,
      message: 'Nothing was imported. Your current board is unchanged.',
      body: list,
      actions: [{ label: 'Close', value: true, variant: 'primary' }]
    });
  }

  function showWarnings(projectName, warnings) {
    var list = document.createElement('ul');
    list.className = 'modal__list';
    warnings.forEach(function (message) {
      var li = document.createElement('li');
      li.textContent = message;
      list.appendChild(li);
    });
    return ESB.ui.modal({
      title: 'Import finished with warnings',
      message: '"' + projectName + '" was imported, but some values were repaired.',
      body: list,
      actions: [{ label: 'Got it', value: true, variant: 'primary' }]
    });
  }

  function countLabel(count, singular, pluralWord) {
    return count + ' ' + (count === 1 ? singular : (pluralWord || singular + 's'));
  }

  function uniqueImportedName(name) {
    var base = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Imported Board';
    var used = Object.create(null);
    ESB.projects.list().forEach(function (entry) {
      used[String(entry.name || '').toLowerCase()] = true;
    });
    if (ESB.store && ESB.store.getProject()) {
      used[String(ESB.store.getProject().name || '').toLowerCase()] = true;
    }

    var candidate = base + ' (imported)';
    var index = 2;
    while (used[candidate.toLowerCase()]) {
      candidate = base + ' (imported ' + index + ')';
      index += 1;
    }
    return candidate;
  }

  /*
   * Importing a file whose project id is already stored must not overwrite the
   * existing project: the file becomes an independent copy with a fresh id.
   */
  function prepareImport(project) {
    if (!project || !project.id || !ESB.projects.has(project.id)) {
      return { project: project, copied: false };
    }
    var copy = model.clone(project);
    copy.id = model.uid('prj');
    copy.name = uniqueImportedName(copy.name);
    return { project: copy, copied: true };
  }

  function exportJson() {
    var project = ESB.store.getProject();
    var envelope = model.emptyEnvelope(project);
    var json = JSON.stringify(envelope, null, 2);
    var filename = ESB.files.sanitizeName(project.name) + '-' + ESB.files.stamp() + '.json';
    ESB.files.download(json, filename, 'application/json');
    ESB.ui.toast('Project exported as JSON');
  }

  /*
   * Import replaces the in-memory board. If the current board has unsaved
   * changes, try to persist it first; if that fails, ask before discarding.
   */
  function saveCurrentBoard() {
    if (!ESB.store.isDirty()) return Promise.resolve({ ok: true, skipped: true });

    if (!ESB.projects.available()) {
      return ESB.ui.confirm({
        title: 'Current board cannot be saved',
        message: 'Local storage is unavailable, so the open board cannot be saved before the import. Importing now replaces it in memory. Export the current board first if you need to keep it.',
        cancelLabel: 'Keep current board',
        confirmLabel: 'Import anyway',
        danger: true
      }).then(function (confirmed) {
        return { ok: confirmed === true };
      });
    }

    try {
      ESB.projects.save(ESB.store.getProject());
      ESB.store.markSaved(new Date().toISOString());
      return Promise.resolve({ ok: true, saved: true });
    } catch (err) {
      return ESB.ui.confirm({
        title: 'Current board could not be saved',
        message: err.message + ' Importing now replaces the open board in memory. Export it first if you need to keep the unsaved changes.',
        cancelLabel: 'Keep current board',
        confirmLabel: 'Import anyway',
        danger: true
      }).then(function (confirmed) {
        return { ok: confirmed === true, error: err };
      });
    }
  }

  function applyImportedProject(project, options) {
    var opts = options || {};
    var prepared = opts.prepared
      ? { project: project, copied: Boolean(opts.copied) }
      : prepareImport(project);
    var target = prepared.project;

    ESB.store.replaceProject(target);
    ESB.canvas.restoreViewport(target.board.viewport);
    ESB.canvas.syncGrid(target.board.settings);

    var saved = true;
    try {
      ESB.projects.save(target);
      ESB.store.markSaved(new Date().toISOString());
    } catch (err) {
      saved = false;
      ESB.ui.toast(err.message, { type: 'error', duration: 7000 });
    }

    var stats = ESB.store.getStats();
    ESB.ui.toast(
      'Imported "' + target.name + '" (' + countLabel(stats.elements, 'element') +
      (prepared.copied ? ', saved as a copy' : '') +
      (saved ? '' : ', not saved locally') + ')'
    );
    return saved;
  }

  function importFile(file) {
    if (!file) return Promise.resolve(false);
    if (file.size > MAX_FILE_BYTES) {
      return showErrors('Import failed', [
        'The file is ' + Math.round(file.size / (1024 * 1024)) + ' MB, which is larger than the 25 MB limit.'
      ]).then(function () { return false; });
    }

    return ESB.files.readText(file).then(function (text) {
      if (!text.trim()) {
        return showErrors('Import failed', ['The selected file is empty.']).then(function () { return false; });
      }

      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return showErrors('Import failed', [
          'The file is not valid JSON. ' + err.message,
          'Use a .json file created with Export from this application.'
        ]).then(function () { return false; });
      }

      var result = ESB.validate.validateProjectFile(parsed);
      if (!result.ok) {
        return showErrors('Import failed', result.errors).then(function () { return false; });
      }

      var prepared = prepareImport(result.project);
      var project = prepared.project;
      var stats = {
        elements: project.board.elements.length,
        connections: project.board.connections.length,
        groups: project.board.groups.length
      };

      var body = document.createElement('div');
      var details = document.createElement('p');
      details.className = 'modal__message';
      details.textContent = 'This replaces the board currently open in this browser. It contains ' +
        countLabel(stats.elements, 'element') + ', ' + countLabel(stats.connections, 'connection') +
        ' and ' + countLabel(stats.groups, 'group') + ', and was last modified ' +
        new Date(project.updatedAt).toLocaleString() + '.';
      body.appendChild(details);

      if (prepared.copied) {
        var copyNote = document.createElement('p');
        copyNote.className = 'modal__note';
        copyNote.textContent = 'This file uses a project ID that already exists in this browser. It will be imported as a separate copy named "' + project.name + '". Nothing already saved will be overwritten.';
        body.appendChild(copyNote);
      }

      if (ESB.store.isDirty()) {
        var dirtyNote = document.createElement('p');
        dirtyNote.className = 'modal__note';
        dirtyNote.textContent = ESB.projects.available()
          ? 'The open board has unsaved changes. It will be saved before the import starts.'
          : 'Local storage is unavailable, so the open board cannot be saved first. Export it now if you need to keep those changes.';
        body.appendChild(dirtyNote);
      }

      if (result.warnings.length) {
        var warningTitle = document.createElement('p');
        warningTitle.className = 'modal__subheading';
        warningTitle.textContent = 'Warnings (' + result.warnings.length + ')';
        body.appendChild(warningTitle);
        var warningList = document.createElement('ul');
        warningList.className = 'modal__list';
        result.warnings.slice(0, 8).forEach(function (message) {
          var li = document.createElement('li');
          li.textContent = message;
          warningList.appendChild(li);
        });
        if (result.warnings.length > 8) {
          var more = document.createElement('li');
          more.textContent = '…and ' + (result.warnings.length - 8) + ' more.';
          warningList.appendChild(more);
        }
        body.appendChild(warningList);
      }

      return ESB.ui.modal({
        title: 'Import "' + project.name + '"?',
        body: body,
        actions: [
          { label: 'Cancel', value: false, variant: 'ghost' },
          { label: prepared.copied ? 'Import as copy' : 'Import project', value: true, variant: 'primary' }
        ]
      }).then(function (confirmed) {
        if (!confirmed) return false;
        return saveCurrentBoard().then(function (guard) {
          if (!guard.ok) {
            ESB.ui.toast('Import cancelled. The current board is unchanged.', { duration: 5000 });
            return false;
          }
          var saved = applyImportedProject(project, { prepared: true, copied: prepared.copied });
          if (result.warnings.length && saved) {
            showWarnings(project.name, result.warnings);
          }
          return true;
        });
      });
    }).catch(function (err) {
      return showErrors('Import failed', [err.message || String(err)]).then(function () { return false; });
    });
  }

  ESB.projectIO = {
    exportJson: exportJson,
    importFile: importFile,
    applyImportedProject: applyImportedProject,
    prepareImport: prepareImport
  };
})(window);
