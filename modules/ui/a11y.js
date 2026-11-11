/*
 * Event Storm Board — accessibility helpers.
 * One polite live region for selection/status messages, plus the Help dialog.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var region = null;
  var announceTimer = null;
  var selectionTimer = null;
  var lastMessage = '';
  var lastMessageAt = 0;

  function ensureRegion() {
    if (region && document.body.contains(region)) return region;
    region = document.getElementById('srStatus');
    if (!region) {
      region = document.createElement('div');
      region.id = 'srStatus';
      region.className = 'sr-only';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.appendChild(region);
    }
    return region;
  }

  function announce(message) {
    var text = String(message == null ? '' : message).replace(/\s+/g, ' ').trim();
    if (!text) return;
    var now = Date.now();
    if (text === lastMessage && now - lastMessageAt < 500) return;
    lastMessage = text;
    lastMessageAt = now;

    var node = ensureRegion();
    if (announceTimer) clearTimeout(announceTimer);
    /* Clearing first makes repeated identical messages announce again. */
    node.textContent = '';
    announceTimer = setTimeout(function () {
      announceTimer = null;
      node.textContent = text;
    }, 40);
  }

  function describeSelection() {
    var connectionId = ESB.store.getSelectedConnectionId();
    if (connectionId) {
      var connection = ESB.store.getConnection(connectionId);
      var from = connection ? ESB.store.getElement(connection.from.elementId) : null;
      var to = connection ? ESB.store.getElement(connection.to.elementId) : null;
      var typeInfo = connection && ESB.model.CONNECTION_TYPES[connection.type];
      return 'Connection' + (typeInfo ? ' (' + typeInfo.label + ')' : '') +
        ' from ' + (from ? from.title : 'missing element') +
        ' to ' + (to ? to.title : 'missing element') +
        ' selected. Press F2 to edit the label, or Delete to remove it.';
    }

    var ids = ESB.store.getSelection();
    if (!ids.length) return 'Selection cleared.';
    if (ids.length === 1) {
      var element = ESB.store.getElement(ids[0]);
      if (!element) return 'Selection cleared.';
      var info = ESB.model.typeInfo(element.type);
      return (info ? info.label : 'Element') + ': ' + (element.title || 'Untitled') +
        ' selected. Press Enter to rename, arrow keys to move, Delete to remove.';
    }

    var group = ESB.store.getGroupForSelection ? ESB.store.getGroupForSelection() : null;
    if (group) return 'Group ' + group.name + ' selected, ' + ids.length + ' elements.';
    return ids.length + ' elements selected.';
  }

  function announceSelection() {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(function () {
      selectionTimer = null;
      announce(describeSelection());
    }, 350);
  }

  function key(combo) {
    var parts = String(combo).split('+');
    var fragment = document.createDocumentFragment();
    parts.forEach(function (part, index) {
      if (index > 0) fragment.appendChild(document.createTextNode('+'));
      var kbd = document.createElement('kbd');
      kbd.textContent = part;
      fragment.appendChild(kbd);
    });
    return fragment;
  }

  function helpSection(title, rows) {
    var section = document.createElement('section');
    section.className = 'help__section';

    var heading = document.createElement('h3');
    heading.className = 'help__heading';
    heading.textContent = title;
    section.appendChild(heading);

    var list = document.createElement('dl');
    list.className = 'help__list';
    rows.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'help__row';
      var term = document.createElement('dt');
      term.appendChild(key(row[0]));
      var description = document.createElement('dd');
      description.textContent = row[1];
      line.appendChild(term);
      line.appendChild(description);
      list.appendChild(line);
    });
    section.appendChild(list);
    return section;
  }

  function buildHelp() {
    var body = document.createElement('div');
    body.className = 'help';

    var intro = document.createElement('p');
    intro.className = 'help__intro';
    intro.textContent = 'The whole board works without a mouse. Press Tab to move between the toolbar, palette, board and Properties panel. The board announces selection changes to screen readers.';
    body.appendChild(intro);

    body.appendChild(helpSection('Create and edit', [
      ['Click / drag', 'Add an element from the palette, or click a palette item to add it at the centre'],
      ['Enter / F2', 'Rename the selected element, or the focused element on the board'],
      ['Ctrl+D', 'Duplicate the selection'],
      ['Delete', 'Delete the selected elements or connection'],
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Ctrl+A', 'Select every element'],
      ['Escape', 'Clear the selection, cancel editing, or close the open panel']
    ]));

    body.appendChild(helpSection('Select and move', [
      ['Click', 'Select an element, group or connection'],
      ['Shift+click', 'Add to or remove from the selection'],
      ['Alt+click', 'Select one member of a group'],
      ['Drag empty board', 'Draw a marquee and select everything inside it'],
      ['Arrow keys', 'Move the selection by 1 px (Shift for 10 px)'],
      ['Ctrl+G', 'Group the selection'],
      ['Ctrl+Shift+G', 'Ungroup the selection']
    ]));

    body.appendChild(helpSection('Navigate the board', [
      ['Space+drag / middle-drag', 'Pan the board'],
      ['Ctrl+scroll / + / −', 'Zoom in and out'],
      ['Ctrl+0 / Home', 'Fit the whole board on screen'],
      ['G', 'Toggle the grid'],
      ['M', 'Toggle the minimap'],
      ['F', 'Toggle fullscreen']
    ]));

    body.appendChild(helpSection('Connections and saving', [
      ['Drag an edge port', 'Draw a connection to another element'],
      ['Tab, then Enter', 'Select a connection to edit it in the Properties panel'],
      ['F2', 'Edit the selected connection label'],
      ['Properties → Connect', 'Connect two selected elements without a mouse'],
      ['Ctrl+S', 'Save the project now'],
      ['? / F1', 'Open this help']
    ]));

    var note = document.createElement('p');
    note.className = 'help__note';
    note.textContent = 'Tip: after selecting two elements, the Properties panel offers a Connect button so connections can be created with the keyboard alone.';
    body.appendChild(note);

    return body;
  }

  function openHelp() {
    return ESB.ui.modal({
      title: 'Keyboard shortcuts and help',
      wide: true,
      body: buildHelp(),
      actions: [{ label: 'Close', value: true, variant: 'primary' }]
    });
  }

  function init() {
    ensureRegion();
  }

  ESB.a11y = {
    init: init,
    announce: announce,
    announceSelection: announceSelection,
    describeSelection: describeSelection,
    openHelp: openHelp
  };
})(window);
