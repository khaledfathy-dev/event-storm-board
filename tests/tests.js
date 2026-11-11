/*
 * Event Storm Board — framework-free test suite for the data layer.
 * Open tests/test.html directly in a browser.
 */
(function () {
  'use strict';

  var model = window.ESB.model;
  var validate = window.ESB.validate;
  var store = window.ESB.store;
  var projects = window.ESB.projects;
  var projectIO = window.ESB.projectIO;
  var SnapshotHistory = window.ESB.SnapshotHistory;

  var results = { passed: 0, failed: 0, total: 0, failures: [] };
  var list = document.getElementById('results');
  var summary = document.getElementById('summary');
  var currentGroup = null;

  function group(name) {
    currentGroup = document.createElement('div');
    currentGroup.className = 'group';
    currentGroup.textContent = name;
    list.appendChild(currentGroup);
  }

  function addRow(name, ok, detail) {
    var row = document.createElement('li');
    row.className = ok ? 'ok' : 'bad';
    var mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = ok ? '✓' : '✕';
    var text = document.createElement('span');
    text.textContent = name;
    row.appendChild(mark);
    row.appendChild(text);
    if (detail) {
      var detailEl = document.createElement('span');
      detailEl.className = 'detail';
      detailEl.textContent = detail;
      row.appendChild(detailEl);
    }
    list.appendChild(row);
  }

  function test(name, fn) {
    results.total += 1;
    try {
      fn();
      results.passed += 1;
      addRow(name, true);
    } catch (err) {
      results.failed += 1;
      results.failures.push({ name: name, message: err && err.message ? err.message : String(err) });
      addRow(name, false, err && err.stack ? String(err.stack) : String(err));
      console.error('FAIL: ' + name, err);
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Expected condition to be true');
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'Values differ') + ' — expected ' + JSON.stringify(expected) + ', received ' + JSON.stringify(actual));
    }
  }

  function deepEqual(actual, expected, message) {
    var left = JSON.stringify(actual);
    var right = JSON.stringify(expected);
    if (left !== right) {
      throw new Error((message || 'Values differ') + '\n expected: ' + right + '\n received: ' + left);
    }
  }

  function makeBoardWithConnection() {
    var project = model.createProject('Test');
    store.init(project);
    var a = store.addElement('command', 100, 100);
    var b = store.addElement('domainEvent', 400, 100);
    store.getBoard().connections.push({
      id: model.uid('cn'),
      from: { elementId: a.id, side: 'right' },
      to: { elementId: b.id, side: 'left' },
      type: 'flow',
      style: 'solid',
      label: 'triggers',
      metadata: {}
    });
    return { project: project, a: a, b: b };
  }

  function clearEsbStorage() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (key && key.indexOf('esb:v1:') === 0) keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
  }

  function makeStoredProject(name, elementCount) {
    var project = model.createProject(name);
    for (var i = 0; i < (elementCount || 0); i += 1) {
      project.board.elements.push(model.createElement('note', 40 + i * 220, 40));
    }
    return project;
  }

  /* ------------------------------------------------------------------ */
  group('Model');

  test('createProject produces a versioned, empty board', function () {
    var project = model.createProject('Checkout');
    equal(project.name, 'Checkout');
    equal(project.version, '1.0.0');
    assert(typeof project.id === 'string' && project.id.indexOf('prj_') === 0, 'project id prefix');
    deepEqual(project.board.elements, []);
    deepEqual(project.board.connections, []);
    equal(project.board.settings.gridSize, 20);
    assert(Date.parse(project.createdAt) > 0, 'createdAt is an ISO date');
  });

  test('every element type has valid defaults and minimum sizes', function () {
    model.TYPE_ORDER.forEach(function (type) {
      var info = model.typeInfo(type);
      assert(Boolean(info), 'type info for ' + type);
      var el = model.createElement(type, 10.4, 20.6);
      equal(el.type, type);
      equal(el.x, 10);
      equal(el.y, 21);
      equal(el.width, info.size[0]);
      equal(el.height, info.size[1]);
      assert(info.min[0] <= info.size[0] && info.min[1] <= info.size[1], 'min <= default for ' + type);
      assert(/^el_/.test(el.id), 'element id prefix');
      assert(el.metadata && typeof el.metadata === 'object', 'metadata object');
    });
  });

  test('unknown element types are rejected', function () {
    var threw = false;
    try { model.createElement('saga', 0, 0); } catch (err) { threw = true; }
    assert(threw, 'expected createElement to throw');
  });

  test('element ids are unique across many creations', function () {
    var seen = Object.create(null);
    for (var i = 0; i < 500; i += 1) {
      var el = model.createElement('note', i, i);
      assert(!seen[el.id], 'duplicate id ' + el.id);
      seen[el.id] = true;
    }
  });

  test('contrast ink adapts to background luminance', function () {
    equal(model.contrastInk('#FFFFFF'), '#141B26');
    equal(model.contrastInk('#2563EB'), '#FFFFFF');
    equal(model.contrastInk('#F07C6C'), '#141B26');
    equal(model.contrastInk('not-a-colour'), '#101828');
  });

  test('contentBounds covers every element', function () {
    var elements = [
      model.createElement('note', 50, 60),
      model.createElement('note', 300, 240)
    ];
    var bounds = model.contentBounds(elements);
    equal(bounds.x, 50);
    equal(bounds.y, 60);
    equal(bounds.width, 250 + elements[1].width);
    equal(bounds.height, 180 + elements[1].height);
    equal(model.contentBounds([]), null);
  });

  test('emptyEnvelope wraps the project with app metadata', function () {
    var project = model.createProject('Envelope');
    var envelope = model.emptyEnvelope(project);
    equal(envelope.app, model.APP_ID);
    equal(envelope.schemaVersion, model.SCHEMA_VERSION);
    equal(envelope.project.name, 'Envelope');
    assert(envelope.exportedAt, 'exportedAt present');
  });

  /* ------------------------------------------------------------------ */
  group('Validation');

  test('a fresh export validates and round-trips exactly', function () {
    var project = model.createProject('Round Trip');
    project.description = 'A domain model';
    project.metadata = { team: 'Payments' };
    var element = model.createElement('domainEvent', 320, 180, {
      title: 'Order Placed',
      description: 'The customer checked out',
      businessRules: 'One order per cart',
      notes: 'Confirm with finance',
      metadata: { owner: 'Checkout' }
    });
    var command = model.createElement('command', 80, 180, { title: 'Place Order' });
    project.board.elements.push(element, command);
    project.board.connections.push({
      id: 'cn_test',
      from: { elementId: command.id, side: 'right' },
      to: { elementId: element.id, side: 'left' },
      type: 'flow',
      style: 'solid',
      label: 'triggers',
      metadata: { confidence: 'high' }
    });
    project.board.viewport = { x: -120, y: 40, zoom: 1.4 };
    project.board.settings.snap = false;

    var envelope = model.emptyEnvelope(project);
    var result = validate.validateProjectFile(JSON.parse(JSON.stringify(envelope)));

    assert(result.ok, 'expected valid import: ' + result.errors.join('; '));
    equal(result.errors.length, 0);
    equal(result.project.name, 'Round Trip');
    equal(result.project.description, 'A domain model');
    equal(result.project.metadata.team, 'Payments');
    equal(result.project.board.elements.length, 2);
    equal(result.project.board.connections.length, 1);
    equal(result.project.board.viewport.zoom, 1.4);
    equal(result.project.board.settings.snap, false);

    var restored = result.project.board.elements.filter(function (el) { return el.id === element.id; })[0];
    assert(Boolean(restored), 'element id preserved');
    equal(restored.x, element.x);
    equal(restored.y, element.y);
    equal(restored.width, element.width);
    equal(restored.title, 'Order Placed');
    equal(restored.businessRules, 'One order per cart');
    equal(restored.metadata.owner, 'Checkout');
    equal(result.project.board.connections[0].from.elementId, command.id);
    equal(result.project.board.connections[0].label, 'triggers');
  });

  test('non-object input is rejected with a readable error', function () {
    var result = validate.validateProjectFile(null);
    equal(result.ok, false);
    assert(result.errors[0].toLowerCase().indexOf('json object') >= 0, 'message mentions JSON object');
    equal(validate.validateProjectFile([]).ok, false);
  });

  test('foreign app marker is rejected', function () {
    var envelope = model.emptyEnvelope(model.createProject('X'));
    envelope.app = 'some-other-tool';
    var result = validate.validateProjectFile(envelope);
    equal(result.ok, false);
    assert(result.errors[0].indexOf('not created by Event Storm Board') >= 0, 'app error message');
  });

  test('bare project documents import with a warning', function () {
    var project = model.createProject('Bare');
    var result = validate.validateProjectFile(JSON.parse(JSON.stringify(project)));
    assert(result.ok, 'bare project accepted');
    equal(result.warnings.length, 1);
    assert(result.warnings[0].indexOf('No application marker') >= 0, 'warning explains missing marker');
  });

  test('unsupported schema major version is rejected', function () {
    var envelope = model.emptyEnvelope(model.createProject('Future'));
    envelope.schemaVersion = '2.0.0';
    var result = validate.validateProjectFile(envelope);
    equal(result.ok, false);
    assert(result.errors[0].indexOf('Unsupported schema version') >= 0, 'version error message');
  });

  test('unknown element types fail validation with the offending index', function () {
    var envelope = model.emptyEnvelope(model.createProject('Bad Type'));
    envelope.project.board.elements.push({ id: 'el_x', type: 'saga', title: 'Nope', x: 0, y: 0 });
    var result = validate.validateProjectFile(envelope);
    equal(result.ok, false);
    assert(result.errors[0].indexOf('unknown type') >= 0, 'error names the problem');
  });

  test('duplicate element ids are rejected', function () {
    var project = model.createProject('Dupes');
    var a = model.createElement('note', 0, 0);
    var b = model.createElement('note', 10, 10);
    b.id = a.id;
    project.board.elements.push(a, b);
    var result = validate.validateProjectFile(model.emptyEnvelope(project));
    equal(result.ok, false);
    assert(result.errors[0].indexOf('Duplicate element id') >= 0, 'duplicate id error');
  });

  test('dangling connections are dropped with a warning', function () {
    var project = model.createProject('Dangling');
    project.board.elements.push(model.createElement('note', 0, 0));
    project.board.connections.push({
      id: 'cn_missing',
      from: { elementId: 'el_nope', side: 'auto' },
      to: { elementId: project.board.elements[0].id, side: 'auto' },
      type: 'flow',
      style: 'solid',
      label: '',
      metadata: {}
    });
    var result = validate.validateProjectFile(model.emptyEnvelope(project));
    assert(result.ok, 'warning-only repair keeps the import');
    equal(result.project.board.connections.length, 0);
    assert(result.warnings.some(function (w) { return w.indexOf('missing elements') >= 0; }), 'warning mentions missing elements');
  });

  test('context references must point at bounded contexts', function () {
    var project = model.createProject('Contexts');
    var note = model.createElement('note', 0, 0);
    var plain = model.createElement('domainEvent', 200, 0);
    note.contextId = plain.id;
    project.board.elements.push(note, plain);
    var result = validate.validateProjectFile(model.emptyEnvelope(project));
    assert(result.ok, 'import succeeds after clearing the bad reference');
    var restored = result.project.board.elements.filter(function (el) { return el.id === note.id; })[0];
    equal(restored.contextId, null);
    assert(result.warnings.some(function (w) { return w.indexOf('non-container context') >= 0; }), 'warning explains reference');
  });

  test('numeric strings are coerced and tiny elements are enlarged', function () {
    var envelope = model.emptyEnvelope(model.createProject('Coerce'));
    envelope.project.board.elements.push({
      id: 'el_coerce',
      type: 'domainEvent',
      title: 'Coerced',
      x: '40',
      y: '60',
      width: 20,
      height: 10
    });
    var result = validate.validateProjectFile(envelope);
    assert(result.ok, 'coercible values import');
    var el = result.project.board.elements[0];
    equal(el.x, 40);
    equal(el.y, 60);
    assert(el.width >= model.typeInfo('domainEvent').min[0], 'width clamped to minimum');
    assert(result.warnings.some(function (w) { return w.indexOf('minimum size') >= 0; }), 'size warning present');
  });

  /* ------------------------------------------------------------------ */
  group('History');

  test('undo and redo walk through snapshots', function () {
    var state = { value: 1 };
    var history = new SnapshotHistory({
      getCurrent: function () { return model.clone(state); },
      onRestore: function (snapshot) { state = snapshot; }
    });
    history.record(model.clone(state), 'First');
    state = { value: 2 };
    history.record(model.clone(state), 'Second');
    state = { value: 3 };

    equal(history.canUndo(), true);
    history.undo();
    equal(state.value, 2);
    history.undo();
    equal(state.value, 1);
    equal(history.canUndo(), false);
    history.redo();
    equal(state.value, 2);
    history.redo();
    equal(state.value, 3);
    equal(history.canRedo(), false);
  });

  test('coalesced records collapse into one undo step', function () {
    var state = { value: 0 };
    var history = new SnapshotHistory({
      getCurrent: function () { return model.clone(state); },
      onRestore: function (snapshot) { state = snapshot; }
    });
    history.record(model.clone(state), 'Typing', 'title:1');
    state.value = 1;
    history.record(model.clone(state), 'Typing', 'title:1');
    state.value = 2;
    history.record(model.clone(state), 'Typing', 'title:1');
    state.value = 3;
    equal(history.undoStack.length, 1, 'only one snapshot recorded');
    history.undo();
    equal(state.value, 0, 'undo returns to the pre-typing snapshot');
  });

  test('history respects its entry limit', function () {
    var state = { value: 0 };
    var history = new SnapshotHistory({
      limit: 3,
      getCurrent: function () { return model.clone(state); },
      onRestore: function (snapshot) { state = snapshot; }
    });
    for (var i = 1; i <= 6; i += 1) {
      history.record(model.clone(state), 'Step ' + i);
      state.value = i;
    }
    equal(history.undoStack.length, 3);
  });

  /* ------------------------------------------------------------------ */
  group('Store');

  test('adding elements selects them and marks the board dirty', function () {
    store.init(model.createProject('Add'));
    var element = store.addElement('domainEvent', 120, 160);
    equal(store.getElements().length, 1);
    deepEqual(store.getSelection(), [element.id]);
    equal(store.isDirty(), true);
    equal(element.x, 120);
    equal(element.y, 160);
  });

  test('updates are coalesced into a single undo step', function () {
    store.init(model.createProject('Coalesce'));
    var element = store.addElement('domainEvent', 0, 0);
    store.updateElement(element.id, { title: 'A' }, { coalesce: 'title:' + element.id });
    store.updateElement(element.id, { title: 'AB' }, { coalesce: 'title:' + element.id });
    store.updateElement(element.id, { title: 'ABC' }, { coalesce: 'title:' + element.id });
    equal(store.getElement(element.id).title, 'ABC');
    store.undo();
    equal(store.getElement(element.id).title, 'Order Placed', 'undo restores the original title');
    store.redo();
    equal(store.getElement(element.id).title, 'ABC');
  });

  test('deleting elements removes their connections', function () {
    var fixture = makeBoardWithConnection();
    equal(store.getConnections().length, 1);
    store.removeElements([fixture.a.id]);
    equal(store.getElements().length, 1);
    equal(store.getConnections().length, 0);
    store.undo();
    equal(store.getElements().length, 2, 'undo restores both elements');
    equal(store.getConnections().length, 1, 'undo restores the connection');
  });

  test('duplicate copies geometry, metadata and internal connections', function () {
    var fixture = makeBoardWithConnection();
    var created = store.duplicateElements([fixture.a.id, fixture.b.id]);
    equal(created.length, 2);
    equal(store.getElements().length, 4);
    equal(store.getConnections().length, 2, 'internal connection duplicated');
    var copy = store.getElement(created[0]);
    assert(copy.id !== fixture.a.id, 'new id assigned');
    equal(copy.x, fixture.a.x + 28);
    equal(copy.y, fixture.a.y + 28);
  });

  test('moveElements applies positions and context patches atomically', function () {
    store.init(model.createProject('Move'));
    var context = store.addElement('boundedContext', 0, 0);
    var note = store.addElement('note', 20, 20);
    store.moveElements([{ id: note.id, x: 240, y: 160 }], [{ id: note.id, patch: { contextId: context.id } }]);
    var moved = store.getElement(note.id);
    equal(moved.x, 240);
    equal(moved.y, 160);
    equal(moved.contextId, context.id);
    store.undo();
    equal(store.getElement(note.id).x, 20, 'position restored with the same undo step');
    equal(store.getElement(note.id).contextId, null);
  });

  test('undo snapshots do not alias live element objects', function () {
    store.init(model.createProject('Isolation'));
    var element = store.addElement('note', 0, 0);
    store.updateElement(element.id, { title: 'Saved title' });
    store.getElement(element.id).title = 'Mutated directly';
    store.undo();
    equal(store.getElement(element.id).title, model.defaultTitle('note'), 'undo restores the recorded pre-edit title');
  });

  test('removing a bounded context clears child references', function () {
    store.init(model.createProject('Context removal'));
    var context = store.addElement('boundedContext', 0, 0);
    var note = store.addElement('note', 30, 30);
    store.updateElement(note.id, { contextId: context.id });
    store.removeElements([context.id]);
    equal(store.getElement(note.id).contextId, null);
  });

  test('selection is pruned when the selected element disappears', function () {
    store.init(model.createProject('Selection'));
    var a = store.addElement('note', 0, 0);
    store.select([a.id]);
    deepEqual(store.getSelection(), [a.id]);
    store.removeElements([a.id]);
    equal(store.getSelection().length, 0);
  });

  test('project meta changes are saved without a history entry', function () {
    store.init(model.createProject('Meta'));
    var before = store.canUndo();
    store.setProjectMeta({ name: 'Renamed', description: 'Desc', version: '2.1.0' });
    equal(store.getProject().name, 'Renamed');
    equal(store.getProject().version, '2.1.0');
    equal(store.canUndo(), before, 'renaming is not an undoable board edit');
  });

  test('stats reflect the current board', function () {
    var fixture = makeBoardWithConnection();
    var stats = store.getStats();
    equal(stats.elements, 2);
    equal(stats.connections, 1);
    equal(stats.counts.command, 1);
    equal(stats.counts.domainEvent, 1);
    assert(fixture.project, 'fixture created');
  });

  /* ------------------------------------------------------------------ */
  group('Groups');

  function makeGroupedPair() {
    store.init(model.createProject('Groups'));
    var a = store.addElement('domainEvent', 100, 100);
    var b = store.addElement('command', 400, 100);
    var group = store.groupElements([a.id, b.id], { name: 'Checkout' });
    return { a: a, b: b, group: group };
  }

  test('groupElements creates canonical membership and derives groupId', function () {
    var fixture = makeGroupedPair();
    assert(Boolean(fixture.group), 'group created');
    equal(store.getGroups().length, 1);
    equal(fixture.group.name, 'Checkout');
    deepEqual(fixture.group.elementIds.slice().sort(), [fixture.a.id, fixture.b.id].sort());
    equal(store.getElement(fixture.a.id).groupId, fixture.group.id);
    equal(store.getElement(fixture.b.id).groupId, fixture.group.id);
    equal(store.getGroupForElement(fixture.a.id).id, fixture.group.id);
  });

  test('groups require two non-container elements', function () {
    store.init(model.createProject('Group limits'));
    var a = store.addElement('note', 0, 0);
    var b = store.addElement('note', 200, 0);
    var context = store.addElement('boundedContext', 400, 0);

    equal(store.groupElements([a.id]), null, 'one element is not enough');
    equal(store.groupElements([a.id, context.id]), null, 'containers are excluded');
    equal(store.getGroups().length, 0);

    var group = store.groupElements([a.id, b.id], { name: 'Notes' });
    assert(Boolean(group), 'valid pair grouped');
    equal(store.getGroups().length, 1);
  });

  test('regrouping dissolves groups that fall below two members', function () {
    store.init(model.createProject('Regroup'));
    var a = store.addElement('note', 0, 0);
    var b = store.addElement('note', 200, 0);
    var c = store.addElement('note', 400, 0);
    var d = store.addElement('note', 600, 0);

    store.groupElements([a.id, b.id], { name: 'First' });
    store.groupElements([c.id, d.id], { name: 'Second' });
    var mixed = store.groupElements([a.id, c.id], { name: 'Mixed' });

    equal(store.getGroups().length, 1, 'only the new mixed group survives');
    equal(store.getGroups()[0].id, mixed.id);
    equal(store.getElement(a.id).groupId, mixed.id);
    equal(store.getElement(c.id).groupId, mixed.id);
    equal(store.getElement(b.id).groupId, null, 'orphaned member released');
    equal(store.getElement(d.id).groupId, null, 'orphaned member released');
  });

  test('moving one group member moves the whole group', function () {
    var fixture = makeGroupedPair();
    var beforeB = { x: fixture.b.x, y: fixture.b.y };

    store.moveElements([{ id: fixture.a.id, x: fixture.a.x + 60, y: fixture.a.y + 40 }]);

    equal(store.getElement(fixture.a.id).x, 160);
    equal(store.getElement(fixture.a.id).y, 140);
    equal(store.getElement(fixture.b.id).x, beforeB.x + 60, 'second member follows horizontally');
    equal(store.getElement(fixture.b.id).y, beforeB.y + 40, 'second member follows vertically');

    store.undo();
    equal(store.getElement(fixture.b.id).x, beforeB.x, 'one undo restores the whole group');
  });

  test('selectGroup and getGroupForSelection work as a unit', function () {
    var fixture = makeGroupedPair();
    store.selectGroup(fixture.group.id);
    deepEqual(store.getSelection().sort(), [fixture.a.id, fixture.b.id].sort());
    equal(store.getGroupForSelection().id, fixture.group.id);
    equal(store.isGroupSelected(fixture.group.id), true);

    store.select([fixture.a.id]);
    equal(store.isGroupSelected(fixture.group.id), false);
    equal(store.getGroupForSelection(), null, 'partial selection is not a group selection');
  });

  test('ungroupElements dissolves the group and is undoable', function () {
    var fixture = makeGroupedPair();
    equal(store.ungroupElements([fixture.a.id]), true);
    equal(store.getGroups().length, 0);
    equal(store.getElement(fixture.a.id).groupId, null);
    equal(store.getElement(fixture.b.id).groupId, null);

    store.undo();
    equal(store.getGroups().length, 1, 'undo restores the group');
    equal(store.getElement(fixture.a.id).groupId, fixture.group.id);
    equal(store.getElement(fixture.b.id).groupId, fixture.group.id);
  });

  test('renameGroup trims the name and is undoable', function () {
    var fixture = makeGroupedPair();
    store.renameGroup(fixture.group.id, '  Delivery  ');
    equal(store.getGroup(fixture.group.id).name, 'Delivery');
    store.undo();
    equal(store.getGroup(fixture.group.id).name, 'Checkout');
  });

  test('duplicateElements copies group membership with new ids', function () {
    var fixture = makeGroupedPair();
    var created = store.duplicateElements([fixture.a.id, fixture.b.id]);

    equal(created.length, 2);
    equal(store.getGroups().length, 2, 'a new group was created for the copies');
    var copyGroup = store.getGroupForElement(created[0]);
    assert(Boolean(copyGroup), 'copy belongs to a group');
    assert(copyGroup.id !== fixture.group.id, 'copy group has a new id');
    equal(copyGroup.name, 'Checkout copy');
    equal(copyGroup.elementIds.length, 2);
    equal(store.getGroupForElement(created[1]).id, copyGroup.id);
    equal(store.getGroupForElement(fixture.a.id).id, fixture.group.id, 'source membership unchanged');
  });

  test('deleting a member dissolves a one-member group', function () {
    var fixture = makeGroupedPair();
    store.removeElements([fixture.a.id]);
    equal(store.getGroups().length, 0);
    equal(store.getElement(fixture.b.id).groupId, null, 'survivor is released');
    store.undo();
    equal(store.getGroups().length, 1, 'undo restores membership');
    equal(store.getElement(fixture.b.id).groupId, fixture.group.id);
  });

  test('duplicating a bounded context and its members remaps copied context ids', function () {
    store.init(model.createProject('Context duplicate'));
    var context = store.addElement('boundedContext', 0, 0);
    var child = store.addElement('note', 40, 40);
    store.updateElement(child.id, { contextId: context.id }, { label: 'Assign bounded context' });

    var created = store.duplicateElements([context.id, child.id]);
    equal(created.length, 2);
    var copies = created.map(store.getElement);
    var copyContext = copies.filter(function (el) { return el.type === 'boundedContext'; })[0];
    var copyChild = copies.filter(function (el) { return el.type === 'note'; })[0];

    assert(Boolean(copyContext && copyChild), 'both copies exist');
    equal(copyChild.contextId, copyContext.id, 'copy belongs to the copied context');
    equal(store.getElement(child.id).contextId, context.id, 'source reference is unchanged');
  });

  test('import validation repairs duplicates, containers and cross-group members', function () {
    var project = model.createProject('Group repair');
    var a = model.createElement('note', 0, 0);
    a.id = 'el_group_a';
    var b = model.createElement('note', 200, 0);
    b.id = 'el_group_b';
    var c = model.createElement('note', 400, 0);
    c.id = 'el_group_c';
    var container = model.createElement('boundedContext', 600, 0);
    container.id = 'el_group_ctx';
    project.board.elements = [a, b, c, container];
    project.board.groups = [
      { id: 'grp_first', name: 'First', elementIds: ['el_group_a', 'el_group_a', 'el_group_b', 'el_group_ctx'] },
      { id: 'grp_second', name: 'Second', elementIds: ['el_group_b', 'el_group_c'] },
      { id: 'grp_small', name: 'Small', elementIds: ['el_group_c'] }
    ];
    a.groupId = 'grp_wrong';
    b.groupId = 'grp_wrong';

    var result = validate.validateProjectFile(model.emptyEnvelope(project));
    assert(result.ok, 'validation succeeds');
    equal(result.project.board.groups.length, 1);
    var group = result.project.board.groups[0];
    equal(group.id, 'grp_first');
    deepEqual(group.elementIds, ['el_group_a', 'el_group_b']);
    equal(result.project.board.elements[0].groupId, 'grp_first');
    equal(result.project.board.elements[1].groupId, 'grp_first');
    equal(result.project.board.elements[2].groupId, null);
    equal(result.project.board.elements[3].groupId, null, 'containers never join groups');
    assert(result.warnings.some(function (warning) { return warning.indexOf('group') >= 0; }), 'warnings explain repairs');
  });

  /* ------------------------------------------------------------------ */
  group('Connections');

  test('addConnection links two elements, normalises fields and selects the link', function () {
    store.init(model.createProject('Connect'));
    var command = store.addElement('command', 0, 0);
    var event = store.addElement('domainEvent', 300, 0);
    var connection = store.addConnection({
      from: { elementId: command.id, side: 'right' },
      to: { elementId: event.id },
      type: 'policy-link',
      label: 'triggers'
    });

    assert(Boolean(connection), 'connection created');
    equal(connection.type, 'policy-link');
    equal(connection.style, 'solid');
    equal(connection.from.side, 'right');
    equal(connection.to.side, 'auto');
    equal(connection.label, 'triggers');
    equal(store.getConnections().length, 1);
    equal(store.getSelectedConnectionId(), connection.id);
    deepEqual(store.getSelection(), [], 'element selection is cleared');
  });

  test('addConnection rejects self links and unknown elements', function () {
    store.init(model.createProject('Invalid links'));
    var a = store.addElement('note', 0, 0);
    equal(store.addConnection({ from: { elementId: a.id }, to: { elementId: a.id } }), null);
    equal(store.addConnection({ from: { elementId: a.id }, to: { elementId: 'el_missing' } }), null);
    equal(store.getConnections().length, 0);
  });

  test('updateConnection sanitises type, style and label', function () {
    var fixture = makeBoardWithConnection();
    var connection = store.getConnections()[0];
    store.updateConnection(connection.id, {
      type: 'unknown-type',
      style: 'zigzag',
      label: new Array(260).join('x')
    });
    var afterInvalid = store.getConnection(connection.id);
    equal(afterInvalid.type, 'flow', 'unknown type ignored');
    equal(afterInvalid.style, 'solid', 'unknown style ignored');
    equal(afterInvalid.label.length, 200, 'label truncated');

    store.updateConnection(connection.id, { type: 'association', style: 'dashed', label: 'emits' });
    var afterValid = store.getConnection(connection.id);
    equal(afterValid.type, 'association');
    equal(afterValid.style, 'dashed');
    equal(afterValid.label, 'emits');

    var before = store.getConnection(connection.id);
    store.updateConnection(connection.id, { to: { elementId: fixture.a.id } });
    equal(store.getConnection(connection.id).to.elementId, before.to.elementId, 'self link patch rejected');
  });

  test('swapConnection reverses direction and is undoable', function () {
    var fixture = makeBoardWithConnection();
    var connection = store.getConnections()[0];
    equal(store.swapConnection(connection.id), true);
    var swapped = store.getConnection(connection.id);
    equal(swapped.from.elementId, fixture.b.id);
    equal(swapped.to.elementId, fixture.a.id);
    equal(swapped.from.side, 'left');
    equal(swapped.to.side, 'right');
    store.undo();
    var restored = store.getConnection(connection.id);
    equal(restored.from.elementId, fixture.a.id);
    equal(restored.from.side, 'right');
  });

  test('removeConnection clears its selection and undo restores it', function () {
    var fixture = makeBoardWithConnection();
    var connection = store.getConnections()[0];
    store.selectConnection(connection.id);
    equal(store.removeConnection(connection.id), true);
    equal(store.getConnections().length, 0);
    equal(store.getSelectedConnectionId(), null);
    store.undo();
    equal(store.getConnections().length, 1, 'undo restores the connection');
    equal(store.getConnections()[0].id, connection.id);
    assert(fixture.a, 'fixture retained');
  });

  test('selection APIs clear a selected connection', function () {
    var fixture = makeBoardWithConnection();
    var connection = store.getConnections()[0];
    store.selectConnection(connection.id);
    store.select([fixture.a.id]);
    equal(store.getSelectedConnectionId(), null, 'element selection clears the link');

    store.selectConnection(connection.id);
    store.clearSelection();
    equal(store.getSelectedConnectionId(), null, 'clearSelection clears the link');
  });

  test('self connections are dropped during import with a warning', function () {
    var project = model.createProject('Self link');
    var element = model.createElement('note', 0, 0);
    project.board.elements.push(element);
    project.board.connections.push({
      id: 'cn_self',
      from: { elementId: element.id, side: 'left' },
      to: { elementId: element.id, side: 'right' },
      type: 'flow',
      style: 'solid',
      label: 'loop',
      metadata: {}
    });
    var result = validate.validateProjectFile(model.emptyEnvelope(project));
    assert(result.ok, 'import succeeds after dropping the link');
    equal(result.project.board.connections.length, 0);
    assert(result.warnings.some(function (w) { return w.indexOf('missing elements') >= 0; }), 'warning explains the drop');
  });

  /* ------------------------------------------------------------------ */
  group('Storage and import hardening');

  test('saved projects are listed with connection and group counts', function () {
    clearEsbStorage();
    var project = makeStoredProject('Counted Board', 3);
    var ids = project.board.elements.map(function (el) { return el.id; });
    project.board.connections.push({
      id: 'cn_counts',
      from: { elementId: ids[0], side: 'right' },
      to: { elementId: ids[1], side: 'left' },
      type: 'flow',
      style: 'solid',
      label: 'emits',
      metadata: {}
    });
    project.board.groups.push({ id: 'grp_counts', name: 'Pair', elementIds: [ids[0], ids[1]] });
    projects.save(project);

    var summary = projects.getSummary(project.id);
    assert(Boolean(summary), 'summary saved to the index');
    equal(summary.elementCount, 3);
    equal(summary.connectionCount, 1);
    equal(summary.groupCount, 1);
    assert(summary.bytes > 0, 'summary records the stored size');

    var info = projects.getStorageInfo();
    equal(info.projectCount, 1);
    equal(info.storedCount, 1);
    equal(info.orphanCount, 0);
    equal(info.missingCount, 0);
    equal(info.corruptCount, 0);
    equal(info.issueCount, 0);
    equal(info.currentId, project.id);
    equal(info.currentValid, true);
    assert(info.esbBytes > 0, 'storage usage is measured');
    equal(projects.has(project.id), true);
    equal(projects.has('prj_missing'), false);
    clearEsbStorage();
  });

  test('repair rebuilds a lost index and restores orphaned boards', function () {
    clearEsbStorage();
    var first = makeStoredProject('First Board', 1);
    var second = makeStoredProject('Second Board', 2);
    projects.save(first);
    projects.save(second);

    localStorage.setItem(projects.keys.index, '{not valid json');
    var broken = projects.getStorageInfo();
    equal(broken.indexCorrupt, true);
    equal(broken.orphanCount, 2);
    equal(broken.projectCount, 2);
    assert(broken.issueCount >= 2, 'unreadable index and orphans are reported');

    var repaired = projects.repair();
    equal(repaired.recovered, 2);
    equal(projects.list().length, 2);
    var info = projects.getStorageInfo();
    equal(info.orphanCount, 0);
    equal(info.indexCorrupt, false);
    equal(info.issueCount, 0);
    equal(info.currentId, second.id, 'the last saved board stays current');
    clearEsbStorage();
  });

  test('repair drops stale index entries and unreadable records', function () {
    clearEsbStorage();
    var project = makeStoredProject('Healthy Board', 1);
    projects.save(project);

    var index = JSON.parse(localStorage.getItem(projects.keys.index));
    index.projects.push({ id: 'prj_ghost', name: 'Ghost Board', elementCount: 1 });
    localStorage.setItem(projects.keys.index, JSON.stringify(index));
    localStorage.setItem(projects.keys.projectPrefix + 'prj_broken', '{not valid json');

    var broken = projects.getStorageInfo();
    equal(broken.missingCount, 1);
    equal(broken.corruptCount, 1);
    equal(broken.storedCount, 2);

    var repaired = projects.repair();
    equal(repaired.droppedEntries, 1, 'stale index entry removed');
    equal(repaired.removedCorrupt, 1, 'unreadable project removed');
    equal(projects.list().length, 1);
    equal(projects.list()[0].id, project.id);
    equal(projects.getStorageInfo().issueCount, 0);
    clearEsbStorage();
  });

  test('repair aligns a stored project id with its storage key', function () {
    clearEsbStorage();
    var project = makeStoredProject('Mismatch Board', 1);
    projects.save(project);

    var key = projects.keys.projectPrefix + project.id;
    var raw = JSON.parse(localStorage.getItem(key));
    raw.project.id = 'prj_wrong_id';
    localStorage.setItem(key, JSON.stringify(raw));

    var info = projects.getStorageInfo();
    equal(info.mismatchCount, 1);
    assert(info.issueCount >= 1, 'the mismatch is reported as an issue');
    equal(info.projects[0].idMismatch, true);

    var repaired = projects.repair();
    equal(repaired.rewritten, 1, 'the stored envelope is rewritten');
    equal(projects.load(project.id).id, project.id, 'the canonical key id wins');
    equal(projects.getStorageInfo().mismatchCount, 0);
    clearEsbStorage();
  });

  test('clearAll removes only Event Storm Board keys', function () {
    clearEsbStorage();
    projects.save(makeStoredProject('To Delete', 1));
    localStorage.setItem('unrelated:key', 'keep me');

    var result = projects.clearAll();
    assert(result.removed >= 3, 'project, index and current keys are removed');
    assert(result.bytes > 0, 'removed bytes are reported');
    equal(localStorage.getItem('unrelated:key'), 'keep me');
    equal(projects.list().length, 0);
    equal(projects.getStorageInfo().storedCount, 0);
    localStorage.removeItem('unrelated:key');
    clearEsbStorage();
  });

  test('importing an existing project id produces an independent copy', function () {
    clearEsbStorage();
    var original = makeStoredProject('Checkout', 2);
    projects.save(original);

    var prepared = projectIO.prepareImport(model.clone(original));
    equal(prepared.copied, true);
    assert(prepared.project.id !== original.id, 'copy receives a fresh id');
    assert(prepared.project.name.indexOf('(imported)') > 0, 'copy name is distinguishable');
    equal(prepared.project.board.elements.length, 2, 'board content is preserved');
    equal(projects.list().length, 1, 'the stored project was not replaced');
    equal(projects.load(original.id).name, 'Checkout');

    var fresh = model.createProject('Fresh Board');
    var untouched = projectIO.prepareImport(fresh);
    equal(untouched.copied, false);
    equal(untouched.project, fresh);
    clearEsbStorage();
  });

  test('import sanitises metadata keys and reserves prototype fields', function () {
    var project = model.createProject('Metadata');
    var element = model.createElement('note', 0, 0);
    element.metadata = JSON.parse('{"owner":"Checkout","  spaced   key  ":"value","__proto__":"polluted","constructor":"blocked","prototype":"blocked","longValue":"' +
      new Array(620).join('x') + '"}');
    for (var i = 0; i < 45; i += 1) element.metadata['field' + i] = 'v' + i;
    project.board.elements.push(element);
    assert(Object.prototype.hasOwnProperty.call(element.metadata, '__proto__'), 'fixture has an own reserved key');

    var envelope = { app: model.APP_ID, schemaVersion: model.SCHEMA_VERSION, project: project };
    var result = validate.validateProjectFile(envelope);
    assert(result.ok, 'import still succeeds');
    var metadata = result.project.board.elements[0].metadata;
    equal(metadata.owner, 'Checkout');
    equal(metadata['spaced key'], 'value');
    assert(!Object.prototype.hasOwnProperty.call(metadata, '__proto__'), 'reserved key removed');
    assert(!Object.prototype.hasOwnProperty.call(metadata, 'constructor'), 'constructor removed');
    assert(!Object.prototype.hasOwnProperty.call(metadata, 'prototype'), 'prototype removed');
    equal(metadata.longValue.length, 500, 'values are bounded');
    assert(Object.keys(metadata).length <= 40, 'field count is bounded');
    assert(result.warnings.some(function (warning) {
      return warning.indexOf('metadata') >= 0;
    }), 'normalisation is reported as a warning');
  });

  test('store sanitises live metadata patches', function () {
    store.init(model.createProject('Live metadata'));
    var element = store.addElement('note', 0, 0);
    store.updateElement(element.id, {
      metadata: JSON.parse('{"  Owner  ":"Checkout","__proto__":"polluted","empty":null}')
    });
    var metadata = store.getElement(element.id).metadata;
    equal(metadata.Owner, 'Checkout');
    assert(!Object.prototype.hasOwnProperty.call(metadata, '__proto__'), 'reserved key removed');
    assert(!Object.prototype.hasOwnProperty.call(metadata, 'empty'), 'null values are skipped');
  });

  test('markSaved supports an explicitly unsaved state', function () {
    store.init(model.createProject('Saved state'));
    equal(store.isDirty(), false);
    store.addElement('note', 0, 0);
    equal(store.isDirty(), true);

    store.markSaved(null);
    equal(store.isDirty(), false, 'clearing local copies marks the board clean');
    equal(store.getSavedAt(), null, 'no saved timestamp is invented');

    store.markSaved('2026-01-01T10:30:00.000Z');
    equal(store.getSavedAt(), '2026-01-01T10:30:00.000Z');
  });

  /* ------------------------------------------------------------------ */
  group('Accessibility');

  test('contrastRatio follows the WCAG 2.1 formula', function () {
    var ratio = model.contrastRatio('#000000', '#FFFFFF');
    assert(Math.abs(ratio - 21) < 0.01, 'black on white is 21:1, received ' + ratio);
    equal(model.contrastRatio('#2F6FED', '#2F6FED'), 1, 'identical colours have a ratio of 1');
    assert(Math.abs(model.contrastRatio('#FFFFFF', '#000000') - 21) < 0.01, 'ratio is symmetric');
  });

  test('contrastInk always reaches AA on every palette colour', function () {
    model.TYPE_ORDER.forEach(function (type) {
      var info = model.typeInfo(type);
      var ink = model.contrastInk(info.color);
      var ratio = model.contrastRatio(ink, info.color);
      assert(ratio >= 4.5, type + ' ink ' + ink + ' on ' + info.color + ' is only ' + ratio.toFixed(2) + ':1');
    });
  });

  test('contrastInk picks dark text on light surfaces and white on dark ones', function () {
    equal(model.contrastInk('#FFFFFF'), '#141B26');
    equal(model.contrastInk('#FBE7A1'), '#141B26');
    equal(model.contrastInk('#1E293B'), '#FFFFFF');
  });

  /* ------------------------------------------------------------------ */

  var summaryHtml = '' +
    '<span class="pill total">' + results.total + ' tests</span>' +
    '<span class="pill pass">' + results.passed + ' passed</span>' +
    '<span class="pill fail">' + results.failed + ' failed</span>';
  summary.innerHTML = summaryHtml;

  window.__ESB_TEST_RESULTS__ = results;
  console.log('Event Storm tests: ' + results.passed + ' passed, ' + results.failed + ' failed');
})();
