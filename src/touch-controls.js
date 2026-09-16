export const touchDevice = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch-mode', touchDevice);

export function createTouchControls({ canvas, look, jump, attack, transform, resupply, grapple }) {
  const root = document.getElementById('touch-controls');
  const stick = document.getElementById('move-stick');
  const thumb = document.getElementById('move-thumb');
  const state = { x: 0, y: 0 };
  const pointers = new Map();
  let enabled = false, movePointer = null, lookPointer = null, previousLook;

  function updateStick(event) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * .32;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy), scale = Math.min(1, radius / (length || 1));
    const strength = Math.max(0, Math.min(1, length / radius) - .12) / .88;
    state.x = length ? dx / length * strength : 0;
    state.y = length ? -dy / length * strength : 0;
    thumb.style.transform = `translate(${dx * scale}px, ${dy * scale}px`;
  }

  function release(id) {
    const held = pointers.get(id);
    if (!held) return;
    pointers.delete(id);
    if (id === movePointer) {
      movePointer = null; state.x = state.y = 0; thumb.style.transform = '';
    }
    if (id === lookPointer) lookPointer = null;
    if (held.action === 'grapple') grapple(false);
    held.element.classList.remove('pressed');
    if (held.element.hasPointerCapture(id)) held.element.releasePointerCapture(id);
  }

  function capture(element, event, action) {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { element, action });
    element.classList.add('pressed');
  }

  function beginLook(event) {
    if (lookPointer !== null) return;
    lookPointer = event.pointerId;
    previousLook = { x: event.clientX, y: event.clientY };
  }

  function updateLook(event) {
    if (event.pointerId !== lookPointer) return;
    event.preventDefault();
    const sensitivity = Math.PI / Math.max(320, Math.min(innerWidth, innerHeight));
    look((event.clientX - previousLook.x) * sensitivity, (event.clientY - previousLook.y) * sensitivity);
    previousLook = { x: event.clientX, y: event.clientY };
  }

  stick.addEventListener('pointerdown', event => {
    if (!enabled || movePointer !== null) return;
    movePointer = event.pointerId;
    capture(stick, event, 'move'); updateStick(event);
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === movePointer) { event.preventDefault(); updateStick(event); }
  });
  canvas.addEventListener('pointerdown', event => {
    if (!enabled || event.pointerType === 'mouse' || lookPointer !== null) return;
    beginLook(event);
    capture(canvas, event, 'look');
  });
  canvas.addEventListener('pointermove', updateLook);

  const actions = { jump, attack, transform, resupply };
  root.querySelectorAll('[data-touch-action]').forEach(button => {
    const action = button.dataset.touchAction;
    button.addEventListener('pointerdown', event => {
      if (!enabled || button.disabled || [...pointers.values()].some(held => held.element === button)) return;
      capture(button, event, action);
      if (action === 'grapple') { beginLook(event); grapple(true); }
      else actions[action]();
    });
    if (action === 'grapple') button.addEventListener('pointermove', updateLook);
    // Allow keyboard/assistive activation without double-firing touch clicks.
    button.addEventListener('click', event => {
      if (enabled && event.detail === 0 && actions[action]) actions[action]();
    });
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(event, e => release(e.pointerId));
  }
  const reset = () => { for (const id of [...pointers.keys()]) release(id); };
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  root.addEventListener('contextmenu', event => event.preventDefault());

  return {
    state, reset,
    setEnabled(value) {
      reset(); enabled = value && touchDevice; root.hidden = !enabled;
    },
  };
}
