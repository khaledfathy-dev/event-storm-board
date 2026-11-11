/*
 * Event Storm Board — light/dark theme preference.
 * The saved theme is applied by an inline boot script before paint; this module
 * keeps the toolbar toggle, metadata and canvas chrome in sync afterwards.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var KEY = 'esb:v1:theme';
  var LIGHT_COLOR = '#2F6FED';
  var DARK_COLOR = '#0B1119';

  var button = null;
  var media = null;
  var current = 'light';
  var explicit = false;
  var initialized = false;

  function normalise(value) {
    return value === 'dark' || value === 'light' ? value : null;
  }

  function storedTheme() {
    try {
      return normalise(global.localStorage.getItem(KEY));
    } catch (err) {
      return null;
    }
  }

  function systemTheme() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function syncMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current === 'dark' ? DARK_COLOR : LIGHT_COLOR);
  }

  function syncButton() {
    if (!button) return;
    var dark = current === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function apply(theme) {
    current = normalise(theme) || 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', current);
    root.style.colorScheme = current;
    syncMeta();
    syncButton();
  }

  function refreshCanvas() {
    if (ESB.minimap && typeof ESB.minimap.sync === 'function') ESB.minimap.sync();
    if (ESB.connections && typeof ESB.connections.sync === 'function') ESB.connections.sync();
    if (ESB.groups && typeof ESB.groups.sync === 'function') ESB.groups.sync();
  }

  function announce() {
    if (ESB.a11y && typeof ESB.a11y.announce === 'function') {
      ESB.a11y.announce(current === 'dark' ? 'Dark theme enabled.' : 'Light theme enabled.');
    }
  }

  function set(theme) {
    var next = normalise(theme) || systemTheme();
    explicit = true;
    try { global.localStorage.setItem(KEY, next); } catch (err) { /* preference is still applied */ }
    if (next === current) {
      syncButton();
      return current;
    }
    apply(next);
    refreshCanvas();
    announce();
    return current;
  }

  function toggle() {
    return set(current === 'dark' ? 'light' : 'dark');
  }

  function get() {
    return current;
  }

  function init() {
    if (initialized) return;
    initialized = true;

    button = document.getElementById('btnTheme');
    var saved = storedTheme();
    explicit = Boolean(saved);
    apply(saved || systemTheme());

    if (button) {
      button.addEventListener('click', function () { toggle(); });
    }

    if (global.matchMedia) {
      media = global.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (explicit) return;
        apply(systemTheme());
        refreshCanvas();
      };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange);
      } else if (typeof media.addListener === 'function') {
        media.addListener(onChange);
      }
    }
  }

  ESB.theme = {
    init: init,
    get: get,
    set: set,
    toggle: toggle
  };
})(window);
