/**
 * CNU Free — Keyed DOM Reconciler & Reactive Patcher (SPEC V2 Addendum C §3)
 * - Updates ONLY the DOM nodes whose values or attributes changed.
 * - Mutates Text nodes in place (node.nodeValue = nextValue) so existing
 *   Element and Text node references are preserved (never wholesale replaced).
 * - Preserves scroll positions (scrollTop / scrollLeft), focused or user-typed
 *   form inputs (<input>, <textarea>, <select>), and open dialogs/sheets.
 * - Applies a 200ms crossfade class (.reactive-crossfade) to changed status pills
 *   and overlap windows (respecting prefers-reduced-motion in CSS).
 */

function getNodeKey(node) {
  if (!node || node.nodeType !== 1) return null;
  const el = node;
  if (el.id) return `id:${el.id}`;
  const bind = el.getAttribute('data-bind');
  if (bind) return `bind:${bind}`;
  const key = el.getAttribute('data-key');
  if (key) return `key:${key}`;
  const screenId = el.getAttribute('data-screen-id');
  if (screenId) return `screen:${screenId}`;
  const friendRow = el.getAttribute('data-friend-row');
  if (friendRow) return `frow:${friendRow}`;
  const classId = el.getAttribute('data-class-id');
  if (classId) return `class:${classId}`;
  const draftId = el.getAttribute('data-draft-id');
  if (draftId) return `draft:${draftId}`;
  const groupChip = el.getAttribute('data-group');
  if (groupChip && el.getAttribute('data-action') === 'set-now-group-filter') {
    return `groupchip:${groupChip}`;
  }
  const dayIdx = el.getAttribute('data-day-index');
  const action = el.getAttribute('data-action');
  if (dayIdx !== null && action) {
    return `day:${action}:${dayIdx}`;
  }
  const personId = el.getAttribute('data-person-id');
  if (personId && action) {
    return `person:${action}:${personId}`;
  }
  return null;
}

function shouldCrossfadeElement(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.classList.contains('status-pill')) return true;
  if (el.classList.contains('card-mint-overlap')) return true;
  if (el.hasAttribute('data-crossfade')) return true;
  const bind = el.getAttribute('data-bind') || '';
  if (
    bind.includes('window') ||
    bind.includes('next-free') ||
    bind.includes('free-until') ||
    bind.includes('free-together') ||
    bind.includes('suggest-btn')
  ) {
    return true;
  }
  return false;
}

function triggerCrossfade(el) {
  if (!el || !el.classList) return;
  el.classList.remove('reactive-crossfade', 'pill-flipped');
  // Trigger reflow if in live document so repeated flips animate cleanly
  if (typeof el.offsetWidth === 'number') {
    void el.offsetWidth;
  }
  el.classList.add('reactive-crossfade');
}

function syncAttributes(currentEl, targetEl) {
  const prevStateAttr = currentEl.getAttribute('data-person-state');
  const nextStateAttr = targetEl.getAttribute('data-person-state');

  // Remove attributes no longer present on targetEl (except preserved user-typed marker)
  const currentAttrs = Array.from(currentEl.attributes);
  for (const attr of currentAttrs) {
    if (attr.name === 'data-user-typed') continue;
    if (!targetEl.hasAttribute(attr.name)) {
      currentEl.removeAttribute(attr.name);
    }
  }

  // Set or update attributes from targetEl
  const targetAttrs = Array.from(targetEl.attributes);
  for (const attr of targetAttrs) {
    if (
      (currentEl.tagName === 'INPUT' || currentEl.tagName === 'TEXTAREA') &&
      attr.name === 'value' &&
      (currentEl.getAttribute('data-user-typed') === 'true' ||
        (typeof document !== 'undefined' && document.activeElement === currentEl))
    ) {
      continue;
    }
    if (currentEl.getAttribute(attr.name) !== attr.value) {
      currentEl.setAttribute(attr.name, attr.value);
    }
  }

  if (prevStateAttr && nextStateAttr && prevStateAttr !== nextStateAttr) {
    triggerCrossfade(currentEl);
  }
}

function isFormControl(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function syncFormControlState(currentEl, targetEl) {
  const isFocused = typeof document !== 'undefined' && document.activeElement === currentEl;
  const isUserTyped = currentEl.getAttribute('data-user-typed') === 'true';

  if (isFocused || isUserTyped) {
    // Preserve user-typed value, checked state, and cursor selection
    return;
  }

  if (currentEl.tagName === 'INPUT') {
    const type = (currentEl.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (currentEl.checked !== targetEl.checked) {
        currentEl.checked = targetEl.checked;
      }
    } else if (currentEl.value !== targetEl.value) {
      currentEl.value = targetEl.value;
    }
  } else if (currentEl.tagName === 'TEXTAREA' || currentEl.tagName === 'SELECT') {
    if (currentEl.value !== targetEl.value) {
      currentEl.value = targetEl.value;
    }
  }
}

/**
 * Morphs `currentEl` in place to match `targetEl`, mutating only changed attributes
 * and Text nodes while preserving element identity, scroll offsets, and form state.
 */
export function morphDom(currentEl, targetEl, stats = { patchedTextNodes: 0, replacedElements: 0 }) {
  if (!currentEl || !targetEl) return stats;

  // Both are Text nodes: patch nodeValue in place
  if (currentEl.nodeType === 3 && targetEl.nodeType === 3) {
    if (currentEl.nodeValue !== targetEl.nodeValue) {
      currentEl.nodeValue = targetEl.nodeValue;
      stats.patchedTextNodes += 1;
      if (currentEl.parentElement && shouldCrossfadeElement(currentEl.parentElement)) {
        triggerCrossfade(currentEl.parentElement);
      }
    }
    return stats;
  }

  // Both are Comment nodes
  if (currentEl.nodeType === 8 && targetEl.nodeType === 8) {
    if (currentEl.nodeValue !== targetEl.nodeValue) {
      currentEl.nodeValue = targetEl.nodeValue;
    }
    return stats;
  }

  // Different node types or tag names: replace
  if (currentEl.nodeType !== targetEl.nodeType || currentEl.tagName !== targetEl.tagName) {
    if (currentEl.parentNode) {
      currentEl.parentNode.replaceChild(targetEl.cloneNode(true), currentEl);
      stats.replacedElements += 1;
    }
    return stats;
  }

  // Element node reconciliation
  if (currentEl.nodeType === 1) {
    const prevScrollTop = currentEl.scrollTop;
    const prevScrollLeft = currentEl.scrollLeft;

    syncAttributes(currentEl, targetEl);

    if (isFormControl(currentEl)) {
      syncFormControlState(currentEl, targetEl);
      if (currentEl.tagName !== 'SELECT') {
        return stats;
      }
    }

    // Fast path: single text child on both currentEl and targetEl
    if (
      currentEl.childNodes.length === 1 &&
      targetEl.childNodes.length === 1 &&
      currentEl.firstChild.nodeType === 3 &&
      targetEl.firstChild.nodeType === 3
    ) {
      if (currentEl.firstChild.nodeValue !== targetEl.firstChild.nodeValue) {
        currentEl.firstChild.nodeValue = targetEl.firstChild.nodeValue;
        stats.patchedTextNodes += 1;
        if (shouldCrossfadeElement(currentEl)) {
          triggerCrossfade(currentEl);
        }
      }
      return stats;
    }

    // Keyed + positional child reconciliation
    const keyedExisting = new Map();
    for (let i = 0; i < currentEl.childNodes.length; i++) {
      const child = currentEl.childNodes[i];
      const key = getNodeKey(child);
      if (key) {
        keyedExisting.set(key, child);
      }
    }

    const targetChildren = Array.from(targetEl.childNodes);

    for (let i = 0; i < targetChildren.length; i++) {
      const tChild = targetChildren[i];
      const cChild = currentEl.childNodes[i] || null;

      if (tChild.nodeType === 3) {
        if (cChild && cChild.nodeType === 3) {
          if (cChild.nodeValue !== tChild.nodeValue) {
            cChild.nodeValue = tChild.nodeValue;
            stats.patchedTextNodes += 1;
            if (shouldCrossfadeElement(currentEl)) {
              triggerCrossfade(currentEl);
            }
          }
        } else {
          currentEl.insertBefore(tChild.cloneNode(true), cChild);
        }
        continue;
      }

      if (tChild.nodeType === 8) {
        if (cChild && cChild.nodeType === 8) {
          if (cChild.nodeValue !== tChild.nodeValue) {
            cChild.nodeValue = tChild.nodeValue;
          }
        } else {
          currentEl.insertBefore(tChild.cloneNode(true), cChild);
        }
        continue;
      }

      if (tChild.nodeType === 1) {
        const tKey = getNodeKey(tChild);
        if (tKey && keyedExisting.has(tKey)) {
          const matched = keyedExisting.get(tKey);
          keyedExisting.delete(tKey);
          if (matched !== cChild) {
            currentEl.insertBefore(matched, cChild);
          }
          morphDom(matched, tChild, stats);
          continue;
        }

        if (
          cChild &&
          cChild.nodeType === 1 &&
          cChild.tagName === tChild.tagName &&
          !getNodeKey(cChild)
        ) {
          morphDom(cChild, tChild, stats);
          continue;
        }

        currentEl.insertBefore(tChild.cloneNode(true), cChild);
        stats.replacedElements += 1;
      }
    }

    // Remove any extra trailing children
    while (currentEl.childNodes.length > targetChildren.length) {
      const last = currentEl.lastChild;
      // Never remove a user-focused input if somehow unmatched
      if (typeof document !== 'undefined' && last && last.contains && last.contains(document.activeElement)) {
        break;
      }
      currentEl.removeChild(last);
    }

    if (prevScrollTop > 0) {
      currentEl.scrollTop = prevScrollTop;
    }
    if (prevScrollLeft > 0) {
      currentEl.scrollLeft = prevScrollLeft;
    }
  }

  return stats;
}

/**
 * Parses an HTML string and morphs `rootEl` in place to match the parsed element.
 */
export function patchElementFromHtml(rootEl, htmlString) {
  if (!rootEl || typeof document === 'undefined') return null;
  const temp = document.createElement('div');
  temp.innerHTML = htmlString.trim();
  const nextRoot = temp.firstElementChild;
  if (!nextRoot) return null;
  return morphDom(rootEl, nextRoot);
}
