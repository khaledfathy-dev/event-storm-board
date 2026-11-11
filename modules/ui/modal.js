/*
 * Event Storm Board — shared UI primitives: toasts, modals, confirmations.
 */
(function (global) {
  'use strict';

  var ESB = (global.ESB = global.ESB || {});
  var toastRoot = null;
  var modalRoot = null;
  var openModalHandle = null;
  var modalCounter = 0;

  function ensureRoots() {
    toastRoot = toastRoot || document.getElementById('toasts');
    modalRoot = modalRoot || document.getElementById('modalRoot');
  }

  /*
   * Each toast owns its live role, so errors are assertive and notices are
   * polite without announcing everything twice. Hovering or focusing a toast
   * pauses its timer, and every toast can be dismissed explicitly.
   */
  function toast(message, options) {
    ensureRoots();
    if (!toastRoot) return;
    var opts = options || {};
    var node = document.createElement('div');
    node.className = 'toast' + (opts.type ? ' toast--' + opts.type : '');
    node.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
    node.setAttribute('aria-atomic', 'true');

    var icon = document.createElement('span');
    icon.className = 'toast__dot';
    icon.setAttribute('aria-hidden', 'true');
    node.appendChild(icon);

    var text = document.createElement('span');
    text.className = 'toast__text';
    text.textContent = String(message);
    node.appendChild(text);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    node.appendChild(close);

    var remaining = opts.duration || (opts.type === 'error' ? 6000 : 3200);
    var startedAt = Date.now();
    var timer = null;
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      node.classList.remove('is-visible');
      setTimeout(function () { node.remove(); }, 220);
    }

    function pause() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      remaining -= Date.now() - startedAt;
    }

    function resume() {
      if (dismissed || timer) return;
      if (remaining <= 0) {
        dismiss();
        return;
      }
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    }

    close.addEventListener('click', dismiss);
    node.addEventListener('pointerenter', pause);
    node.addEventListener('pointerleave', resume);
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', function (event) {
      if (event.relatedTarget && node.contains(event.relatedTarget)) return;
      resume();
    });

    toastRoot.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-visible'); });
    timer = setTimeout(dismiss, remaining);

    while (toastRoot.children.length > 4) {
      toastRoot.firstElementChild.remove();
    }
  }

  function focusableIn(modal) {
    return Array.prototype.filter.call(
      modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (node) {
        return !node.disabled && node.getClientRects().length > 0;
      }
    );
  }

  function closeModal(result) {
    if (!openModalHandle) return;
    var handle = openModalHandle;
    openModalHandle = null;
    document.removeEventListener('keydown', handle.onKeyDown, true);
    document.removeEventListener('focusin', handle.onFocusIn, true);
    handle.overlay.classList.remove('is-visible');
    setTimeout(function () { handle.overlay.remove(); }, 160);

    if (handle.appRoot) {
      handle.appRoot.inert = handle.previousInert;
      if (handle.previousAriaHidden == null) handle.appRoot.removeAttribute('aria-hidden');
      else handle.appRoot.setAttribute('aria-hidden', handle.previousAriaHidden);
    }

    handle.restoreFocus();
    handle.resolve(result);
  }

  function openModal(config) {
    ensureRoots();
    if (!modalRoot) return Promise.resolve(null);
    if (openModalHandle) closeModal(null);

    var cfg = config || {};
    modalCounter += 1;
    var titleId = 'modalTitle' + modalCounter;
    var messageId = 'modalMessage' + modalCounter;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal' + (cfg.wide ? ' modal--wide' : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', titleId);

    var header = document.createElement('div');
    header.className = 'modal__header';
    var title = document.createElement('h2');
    title.className = 'modal__title';
    title.id = titleId;
    title.textContent = cfg.title || 'Confirm';
    header.appendChild(title);

    if (cfg.dismissible !== false) {
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'icon-btn icon-btn--subtle';
      closeBtn.setAttribute('aria-label', 'Close dialog');
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      closeBtn.addEventListener('click', function () { closeModal(null); });
      header.appendChild(closeBtn);
    }
    modal.appendChild(header);

    var content = document.createElement('div');
    content.className = 'modal__content';

    if (cfg.message) {
      var paragraph = document.createElement('p');
      paragraph.className = 'modal__message';
      paragraph.id = messageId;
      paragraph.textContent = cfg.message;
      content.appendChild(paragraph);
      modal.setAttribute('aria-describedby', messageId);
    }

    if (cfg.body) content.appendChild(cfg.body);

    if (cfg.html) {
      var htmlBlock = document.createElement('div');
      htmlBlock.className = 'modal__html';
      htmlBlock.innerHTML = cfg.html;
      content.appendChild(htmlBlock);
    }
    modal.appendChild(content);

    var actions = document.createElement('div');
    actions.className = 'modal__actions';
    var buttons = cfg.actions || [{ label: 'Close', value: null, variant: 'ghost' }];

    var previousFocus = document.activeElement;
    var resolveFn;
    var promise = new Promise(function (resolve) { resolveFn = resolve; });

    buttons.forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn' + (action.variant === 'primary' ? ' btn--primary' : action.variant === 'danger' ? ' btn--danger' : '');
      button.textContent = action.label;
      button.addEventListener('click', function () {
        closeModal(action.value);
      });
      actions.appendChild(button);
      if (action.autofocus) setTimeout(function () { button.focus(); }, 30);
    });
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay && cfg.dismissible !== false) closeModal(null);
    });

    var appRoot = document.getElementById('app');
    var previousInert = appRoot ? appRoot.inert : false;
    var previousAriaHidden = appRoot ? appRoot.getAttribute('aria-hidden') : null;

    var onKeyDown = function (event) {
      if (event.key === 'Escape' && cfg.dismissible !== false) {
        event.stopPropagation();
        closeModal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = focusableIn(modal);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    var onFocusIn = function (event) {
      if (modal.contains(event.target)) return;
      event.stopPropagation();
      var target = modal.querySelector('.modal__actions .btn') || modal;
      if (target && typeof target.focus === 'function') target.focus();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);

    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }

    modalRoot.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('is-visible'); });

    var autoFocusTarget = modal.querySelector('[autofocus]') || modal.querySelector('.modal__actions .btn');
    if (autoFocusTarget) setTimeout(function () { autoFocusTarget.focus(); }, 20);

    openModalHandle = {
      overlay: overlay,
      resolve: resolveFn,
      onKeyDown: onKeyDown,
      onFocusIn: onFocusIn,
      appRoot: appRoot,
      previousInert: previousInert,
      previousAriaHidden: previousAriaHidden,
      restoreFocus: function () {
        if (previousFocus && typeof previousFocus.focus === 'function' && document.body.contains(previousFocus)) {
          previousFocus.focus();
        }
      }
    };

    return promise;
  }

  function confirm(config) {
    var cfg = typeof config === 'string' ? { message: config } : (config || {});
    return openModal({
      title: cfg.title || 'Are you sure?',
      message: cfg.message || '',
      dismissible: true,
      actions: [
        { label: cfg.cancelLabel || 'Cancel', value: false, variant: 'ghost' },
        { label: cfg.confirmLabel || 'Confirm', value: true, variant: cfg.danger ? 'danger' : 'primary' }
      ]
    }).then(function (result) { return result === true; });
  }

  function alert(config) {
    var cfg = typeof config === 'string' ? { message: config } : (config || {});
    return openModal({
      title: cfg.title || 'Notice',
      message: cfg.message || '',
      actions: [{ label: 'OK', value: true, variant: 'primary' }]
    });
  }

  ESB.ui = {
    toast: toast,
    modal: openModal,
    confirm: confirm,
    alert: alert,
    closeModal: closeModal
  };
})(window);
