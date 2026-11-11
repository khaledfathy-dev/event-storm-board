/*
 * Event Storm Board — small file helpers used by every export.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});

  function sanitizeName(name) {
    var value = String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return value || 'event-storming-board';
  }

  function stamp(date) {
    var d = date || new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function readText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () {
        reject(new Error('The file could not be read. It may have been moved or locked by another application.'));
      };
      reader.readAsText(file);
    });
  }

  function download(content, filename, mimeType) {
    var blob;
    if (content instanceof Blob) {
      blob = content;
    } else {
      blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  ESB.files = {
    sanitizeName: sanitizeName,
    stamp: stamp,
    readText: readText,
    download: download
  };
})(window);
