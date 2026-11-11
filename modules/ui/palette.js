/*
 * Event Storm Board — element palette and drag-to-board.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var model = ESB.model;
  var surface = null;
  var initialized = false;

  function buildPalette() {
    var root = document.getElementById('palette');
    if (!root) return;

    model.TYPE_ORDER.forEach(function (type) {
      var info = model.typeInfo(type);
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'palette-item';
      item.dataset.type = type;
      item.draggable = true;
      item.setAttribute('title', info.label + ' — drag onto the board or press Enter to add');
      item.innerHTML =
        '<span class="palette-item__swatch" aria-hidden="true"></span>' +
        '<span class="palette-item__text">' +
          '<span class="palette-item__label"></span>' +
          '<span class="palette-item__hint"></span>' +
        '</span>';
      item.querySelector('.palette-item__swatch').style.background = info.color;
      item.querySelector('.palette-item__label').textContent = info.label;
      item.querySelector('.palette-item__hint').textContent = info.hint;

      item.addEventListener('click', function () {
        addFromPalette(type);
      });

      item.addEventListener('dragstart', function (event) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', type);
        event.dataTransfer.setData('application/x-esb-type', type);
        item.classList.add('is-dragging');
      });

      item.addEventListener('dragend', function () {
        item.classList.remove('is-dragging');
        surface.classList.remove('is-drop-target');
      });

      root.appendChild(item);
    });
  }

  function addFromPalette(type) {
    var element = ESB.elements.addAtViewportCenter(type);
    if (!element) return;
    ESB.elements.startTitleEdit(element.id);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    surface = document.getElementById('canvasSurface');
    buildPalette();

    surface.addEventListener('dragover', function (event) {
      var types = event.dataTransfer && event.dataTransfer.types;
      if (!types) return;
      var hasType = Array.prototype.indexOf.call(types, 'application/x-esb-type') >= 0 ||
        Array.prototype.indexOf.call(types, 'text/plain') >= 0;
      if (!hasType) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      surface.classList.add('is-drop-target');
    });

    surface.addEventListener('dragleave', function (event) {
      if (event.relatedTarget && surface.contains(event.relatedTarget)) return;
      surface.classList.remove('is-drop-target');
    });

    surface.addEventListener('drop', function (event) {
      event.preventDefault();
      surface.classList.remove('is-drop-target');
      var type = '';
      try {
        type = event.dataTransfer.getData('application/x-esb-type') ||
          event.dataTransfer.getData('text/plain');
      } catch (err) {
        type = '';
      }
      if (!model.isType(type)) return;
      var element = ESB.elements.addAtClientPoint(type, event.clientX, event.clientY);
      if (element) ESB.elements.startTitleEdit(element.id);
    });

    document.querySelectorAll('[data-quick-add]').forEach(function (button) {
      button.addEventListener('click', function () {
        addFromPalette(button.dataset.quickAdd);
      });
    });
  }

  ESB.palette = {
    init: init,
    add: addFromPalette
  };
})(window);
