/*
 * Event Storm Board — project storage diagnostics and maintenance.
 * Uses the index + per-project records exposed by ESB.projects.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var pending = null;
  var body = null;

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    var kb = value / 1024;
    if (kb < 1024) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB';
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  function formatDate(iso) {
    if (!iso) return 'Never saved';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function plural(count, singular, pluralWord) {
    return count + ' ' + (count === 1 ? singular : (pluralWord || singular + 's'));
  }

  function element(text, className) {
    var node = document.createElement('span');
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function button(label, className, action) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'btn' + (className ? ' ' + className : '');
    node.textContent = label;
    node.setAttribute('data-storage-action', action);
    return node;
  }

  function buildSummary(info) {
    var wrap = document.createElement('div');
    wrap.className = 'storage__summary';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Storage summary');

    function stat(value, label) {
      var cell = document.createElement('div');
      cell.className = 'storage__stat';
      cell.appendChild(element(value, 'storage__stat-value'));
      cell.appendChild(element(label, 'storage__stat-label'));
      return cell;
    }

    wrap.appendChild(stat(String(info.projectCount), 'Saved projects'));
    wrap.appendChild(stat(formatBytes(info.esbBytes), 'App storage'));
    wrap.appendChild(stat(formatBytes(info.projectBytes), 'Board data'));

    var note = document.createElement('p');
    note.className = 'storage__capacity';
    note.textContent = 'Approximate usage. Browsers usually allow about 5 MB per site. Last checked ' +
      formatDate(info.checkedAt) + '.';
    wrap.appendChild(note);
    return wrap;
  }

  function buildIssues(info) {
    var panel = document.createElement('section');
    panel.className = 'storage__issues';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Storage issues');

    var title = document.createElement('p');
    title.className = 'storage__issues-title';
    title.textContent = plural(info.issueCount, 'storage issue') + ' found';
    panel.appendChild(title);

    var list = document.createElement('ul');
    function item(text) {
      var li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    }

    if (info.indexCorrupt) {
      item('The project list is unreadable. Repair can rebuild it from the saved boards.');
    }
    if (info.orphanCount) {
      item(plural(info.orphanCount, 'saved board is', 'saved boards are') + ' missing from the project list.');
    }
    if (info.missingCount) {
      item(plural(info.missingCount, 'project list entry points', 'project list entries point') + ' at data that is no longer stored.');
    }
    if (info.corruptCount) {
      item(plural(info.corruptCount, 'stored board cannot', 'stored boards cannot') + ' be read and will be removed by Repair.');
    }
    if (info.mismatchCount) {
      item(plural(info.mismatchCount, 'stored board has', 'stored boards have') + ' an ID that does not match its storage key; Repair fixes it.');
    }
    if (info.currentId && !info.currentValid) {
      item('The last open project could not be restored from storage.');
    }
    panel.appendChild(list);
    return panel;
  }

  function statusBadge(text, tone) {
    return element(text, 'storage__badge storage__badge--' + tone);
  }

  function buildProjectRow(project) {
    var row = document.createElement('div');
    row.className = 'storage__project storage__project--' + project.status +
      (project.current ? ' is-current' : '');
    row.setAttribute('role', 'listitem');
    row.setAttribute('data-storage-project', project.id);

    var top = document.createElement('div');
    top.className = 'storage__project-top';

    var name = document.createElement('span');
    name.className = 'storage__project-name';
    name.textContent = project.name || 'Untitled Board';
    top.appendChild(name);

    if (project.current) top.appendChild(statusBadge('Current', 'current'));
    if (project.status === 'orphan') top.appendChild(statusBadge('Not in list', 'warning'));
    if (project.idMismatch) top.appendChild(statusBadge('ID mismatch', 'warning'));
    if (project.status === 'missing') top.appendChild(statusBadge('Data missing', 'danger'));
    if (project.status === 'corrupt') top.appendChild(statusBadge('Unreadable', 'danger'));
    row.appendChild(top);

    if (project.status === 'missing') {
      row.appendChild(element(project.error || 'Project data is missing.', 'storage__project-detail'));
      row.appendChild(element('Repair removes this stale list entry.', 'storage__project-hint'));
      return row;
    }

    if (project.status === 'corrupt') {
      row.appendChild(element(project.error || 'Stored project could not be read.', 'storage__project-detail'));
      row.appendChild(element('Repair removes unreadable data. Export a backup before repairing if you need to investigate it.', 'storage__project-hint'));
      return row;
    }

    var counts = plural(project.elementCount, 'element') + ' · ' +
      plural(project.connectionCount, 'connection') + ' · ' +
      plural(project.groupCount, 'group');
    row.appendChild(element(counts, 'storage__project-meta'));

    var meta = 'Saved ' + formatDate(project.savedAt || project.updatedAt);
    if (project.bytes) meta += ' · ' + formatBytes(project.bytes);
    row.appendChild(element(meta, 'storage__project-meta'));

    if (project.status === 'orphan') {
      row.appendChild(element('This board is stored safely; Repair restores it to the project list.', 'storage__project-hint'));
    }
    if (project.idMismatch) {
      row.appendChild(element('The stored project ID differs from its storage key; Repair aligns them.', 'storage__project-hint'));
    }
    return row;
  }

  function buildProjects(info) {
    var section = document.createElement('section');
    section.className = 'storage__section';

    var heading = document.createElement('h3');
    heading.className = 'storage__subheading';
    heading.textContent = info.projectCount ? 'Projects' : 'No projects yet';
    section.appendChild(heading);

    if (!info.projectCount) {
      var empty = document.createElement('p');
      empty.className = 'storage__empty';
      empty.textContent = 'Nothing is saved in this browser yet. Changes are saved automatically after you edit the board.';
      section.appendChild(empty);
      return section;
    }

    var list = document.createElement('div');
    list.className = 'storage__list';
    list.setAttribute('role', 'list');

    info.projects.slice().sort(function (a, b) {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.status === 'corrupt' && b.status !== 'corrupt') return -1;
      if (b.status === 'corrupt' && a.status !== 'corrupt') return 1;
      return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
    }).forEach(function (project) {
      list.appendChild(buildProjectRow(project));
    });

    section.appendChild(list);
    return section;
  }

  function buildActions(info) {
    var section = document.createElement('section');
    section.className = 'storage__actions';
    section.setAttribute('aria-label', 'Storage maintenance');

    var repair = document.createElement('div');
    repair.className = 'storage__action';
    var repairText = document.createElement('div');
    repairText.className = 'storage__action-text';
    var repairTitle = document.createElement('strong');
    repairTitle.textContent = 'Repair project list';
    repairText.appendChild(repairTitle);
    repairText.appendChild(element(
      'Rebuilds the project list from saved boards, restores orphaned boards and removes stale or unreadable entries.',
      'storage__action-detail'
    ));
    repair.appendChild(repairText);
    var repairButton = button('Repair', '', 'repair');
    repairButton.disabled = info.issueCount === 0;
    if (info.issueCount === 0) repairButton.title = 'No storage issues were found.';
    repair.appendChild(repairButton);
    section.appendChild(repair);

    var clear = document.createElement('div');
    clear.className = 'storage__action';
    var clearText = document.createElement('div');
    clearText.className = 'storage__action-text';
    var clearTitle = document.createElement('strong');
    clearTitle.textContent = 'Delete local projects';
    clearText.appendChild(clearTitle);
    clearText.appendChild(element(
      'Removes every saved board and the project list from this browser. Export anything you need first.',
      'storage__action-detail'
    ));
    clear.appendChild(clearText);
    var clearButton = button('Delete all', 'btn--danger', 'clear');
    clearButton.disabled = info.indexCount === 0 && info.storedCount === 0;
    clear.appendChild(clearButton);
    section.appendChild(clear);

    return section;
  }

  function buildConfirm(info) {
    var section = document.createElement('section');
    section.className = 'storage__confirm';
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', pending === 'repair' ? 'Confirm repair' : 'Confirm deletion');

    var title = document.createElement('p');
    title.className = 'storage__confirm-title';

    var text = document.createElement('p');
    text.className = 'storage__confirm-text';

    var actions = document.createElement('div');
    actions.className = 'storage__confirm-actions';

    if (pending === 'repair') {
      title.textContent = 'Repair storage?';
      var removals = [];
      if (info.missingCount) removals.push(plural(info.missingCount, 'stale list entry', 'stale list entries'));
      if (info.corruptCount) removals.push(plural(info.corruptCount, 'unreadable board', 'unreadable boards'));
      var corrections = info.mismatchCount
        ? ' ' + plural(info.mismatchCount, 'project ID will', 'project IDs will') + ' be corrected.'
        : '';
      text.textContent = 'The project list will be rebuilt from the stored board data.' +
        (removals.length ? ' ' + removals.join(' and ') + ' will be removed.' : ' No project data will be removed.') +
        corrections;
      actions.appendChild(button('Cancel', '', 'cancel'));
      var repair = button('Repair now', 'btn--primary', 'confirm-repair');
      repair.setAttribute('data-storage-confirm', 'repair');
      actions.appendChild(repair);
    } else {
      title.textContent = 'Delete all local projects?';
      text.textContent = 'This removes ' + plural(info.storedCount, 'saved board') +
        ' and the project list from this browser. The board open in this tab stays in memory but is no longer saved. Export it first if you need to keep it.';
      actions.appendChild(button('Cancel', '', 'cancel'));
      var clear = button('Delete everything', 'btn--danger', 'confirm-clear');
      clear.setAttribute('data-storage-confirm', 'clear');
      actions.appendChild(clear);
    }

    section.appendChild(title);
    section.appendChild(text);
    section.appendChild(actions);
    return section;
  }

  function render(focusConfirm) {
    if (!body) return;
    var info = ESB.projects.getStorageInfo();
    body.textContent = '';

    if (!info.available) {
      var notice = document.createElement('div');
      notice.className = 'storage__notice';
      notice.textContent = 'Local storage is blocked or unavailable in this browser, so there is no saved data to inspect. Use Export to keep your board.';
      body.appendChild(notice);
      return;
    }

    body.appendChild(buildSummary(info));
    if (info.issueCount) body.appendChild(buildIssues(info));
    body.appendChild(buildProjects(info));
    body.appendChild(pending ? buildConfirm(info) : buildActions(info));

    if (focusConfirm) {
      var target = body.querySelector('[data-storage-confirm]');
      if (target) target.focus();
    }
  }

  function describeRepair(result) {
    var parts = [];
    if (result.recovered) parts.push('recovered ' + plural(result.recovered, 'project'));
    if (result.droppedEntries) parts.push('removed ' + plural(result.droppedEntries, 'stale list entry', 'stale list entries'));
    if (result.removedCorrupt) parts.push('deleted ' + plural(result.removedCorrupt, 'unreadable board'));
    if (result.rewritten) parts.push('fixed ' + plural(result.rewritten, 'project ID'));
    if (!parts.length) parts.push('the project list is already consistent');
    return 'Storage repaired — ' + parts.join(', ') + '.';
  }

  function repairNow() {
    try {
      var result = ESB.projects.repair();
      pending = null;
      render();
      ESB.toolbar.sync();
      ESB.ui.toast(describeRepair(result), { duration: 6000 });
    } catch (err) {
      pending = null;
      render();
      ESB.ui.toast(err.message || 'Storage could not be repaired.', { type: 'error', duration: 8000 });
    }
  }

  function clearNow() {
    var info = ESB.projects.getStorageInfo();
    var removedProjects = info.storedCount;
    try {
      ESB.app.cancelAutosave();
      ESB.projects.clearAll();
      ESB.store.markSaved(null);
      ESB.toolbar.clearSaveError();
      ESB.toolbar.sync();
      pending = null;
      render();
      ESB.ui.toast(
        'Deleted ' + plural(removedProjects, 'saved board') + '. The open board is still in this tab but is no longer saved.',
        { duration: 8000 }
      );
    } catch (err) {
      ESB.ui.toast(err.message || 'Local projects could not be deleted.', { type: 'error', duration: 8000 });
    }
  }

  function onClick(event) {
    var target = event.target.closest('[data-storage-action]');
    if (!target || target.disabled) return;
    var action = target.getAttribute('data-storage-action');

    if (action === 'repair') {
      pending = 'repair';
      render(true);
      return;
    }
    if (action === 'clear') {
      pending = 'clear';
      render(true);
      return;
    }
    if (action === 'cancel') {
      pending = null;
      render();
      return;
    }
    if (action === 'confirm-repair') {
      repairNow();
      return;
    }
    if (action === 'confirm-clear') {
      clearNow();
    }
  }

  function open() {
    pending = null;
    body = document.createElement('div');
    body.className = 'storage';
    body.addEventListener('click', onClick);
    render();
    return ESB.ui.modal({
      title: 'Project storage',
      wide: true,
      body: body,
      actions: [{ label: 'Close', value: true, variant: 'primary' }]
    });
  }

  ESB.storage = {
    open: open
  };
})(window);
