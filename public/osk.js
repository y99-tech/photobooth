// Minimal on-screen keyboard for touch kiosks (Raspberry Pi / Linux have no reliable built-in one).
// Inputs with class "osk" get it; inputmode="none" stops phones/tablets opening a second keyboard.
(function () {
  const LAYOUTS = {
    abc: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
    sym: ['1234567890', '@#&*-_+=/()', '.,!?\'":;', '♥❤😊🎉💍']
  };
  let target = null, shift = false, layout = 'abc';
  const el = document.createElement('div');
  el.id = 'osk';
  el.className = 'hidden';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));

  function key(label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  }

  function insert(t) {
    if (!target) return;
    const s = target.selectionStart ?? target.value.length, e = target.selectionEnd ?? s;
    const max = target.maxLength > 0 ? target.maxLength : Infinity;
    if (target.value.length - (e - s) + t.length > max) return;
    target.value = target.value.slice(0, s) + t + target.value.slice(e);
    target.setSelectionRange(s + t.length, s + t.length);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    if (shift && t !== ' ') { shift = false; render(); }
  }

  function render() {
    el.innerHTML = '';
    const isEmail = target && target.type === 'email';
    LAYOUTS[layout].forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'krow';
      if (i === 3 && layout === 'abc') row.appendChild(key('⇧', shift ? 'wide on' : 'wide', () => { shift = !shift; render(); }));
      for (const ch of Array.from(r)) {
        const c = shift ? ch.toUpperCase() : ch;
        row.appendChild(key(c, '', () => insert(c)));
      }
      if (i === 3) row.appendChild(key('⌫', 'wide', backspace));
      el.appendChild(row);
    });
    const last = document.createElement('div');
    last.className = 'krow';
    last.appendChild(key(layout === 'abc' ? '?123' : 'ABC', 'wide', () => { layout = layout === 'abc' ? 'sym' : 'abc'; render(); }));
    if (isEmail) {
      last.appendChild(key('@', '', () => insert('@')));
      last.appendChild(key('.com', 'wide', () => insert('.com')));
      last.appendChild(key('@gmail.com', 'wide', () => insert('@gmail.com')));
    } else {
      last.appendChild(key(',', '', () => insert(',')));
      last.appendChild(key('space', 'xwide', () => insert(' ')));
      last.appendChild(key('!', '', () => insert('!')));
    }
    last.appendChild(key('Done ✓', 'wide on', hide));
    el.appendChild(last);
  }

  function backspace() {
    if (!target) return;
    const s = target.selectionStart ?? target.value.length, e = target.selectionEnd ?? s;
    if (s === e && s === 0) return;
    const from = s === e ? s - Array.from(target.value.slice(0, s)).slice(-1)[0].length : s;
    target.value = target.value.slice(0, from) + target.value.slice(e);
    target.setSelectionRange(from, from);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function show(input) {
    target = input;
    shift = input.value.length === 0 && input.type !== 'email';
    layout = 'abc';
    render();
    el.classList.remove('hidden');
    // Shrink the screen above the keyboard so the field being typed in stays visible.
    document.body.style.setProperty('--osk-h', el.offsetHeight + 'px');
    document.body.classList.add('osk-open');
    requestAnimationFrame(() => input.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  function hide() {
    el.classList.add('hidden');
    document.body.classList.remove('osk-open');
    if (target) { target.blur(); target.dispatchEvent(new Event('change', { bubbles: true })); }
    target = null;
  }

  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches('input.osk, textarea.osk')) show(e.target);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!target) return;
    if (el.contains(e.target) || e.target === target) return;
    hide();
  });

  window.OSK = { hide, isOpen: () => !!target };
})();
