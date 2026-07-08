'use strict';
/* ==========================================================================
   touch.js — mobile / iPad controls. Loaded last (after game.js).

   Adds a floating virtual joystick (left half of the screen) and two action
   buttons (SWING, CUFF). It feeds the exact same `input` object and
   attackPressed / cuffPressed / startPressed flags the keyboard uses, so the
   game logic is untouched.

   Controls only appear when the device's primary pointer is coarse (finger),
   i.e. phones and tablets — desktops and touchscreen laptops keep a clean
   keyboard-only screen.
   ========================================================================== */

(() => {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;
  window.IS_TOUCH = true;

  /* ---------- styles ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #touch-zone-left {
      position: fixed; left: 0; top: 0; width: 48%; height: 100%;
      touch-action: none; z-index: 10;
    }
    #stick-base, #stick-nub {
      position: fixed; border-radius: 50%; display: none;
      pointer-events: none; transform: translate(-50%, -50%);
    }
    #stick-base {
      width: 112px; height: 112px; z-index: 11;
      border: 3px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.08);
    }
    #stick-nub {
      width: 52px; height: 52px; z-index: 12;
      background: rgba(255,255,255,0.45);
    }
    .touch-btn {
      position: fixed; width: 88px; height: 88px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font: bold 15px monospace; color: #fff;
      border: 3px solid rgba(255,255,255,0.5);
      touch-action: none; z-index: 10;
      user-select: none; -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .touch-btn.held { filter: brightness(1.6); }
    #btn-swing   { right: 22px;  bottom: 104px; background: rgba(43,87,201,0.6); }
    #btn-cuff    { right: 122px; bottom: 22px;  background: rgba(40,140,70,0.6); }
    #btn-whistle { right: 122px; bottom: 104px; background: rgba(150,90,200,0.6); display: none; }
    #rotate-hint {
      display: none; position: fixed; top: 0; left: 0; right: 0;
      padding: 10px; z-index: 20; text-align: center;
      background: #ffd23e; color: #222; font: bold 14px monospace;
    }
    @media (orientation: portrait) {
      #rotate-hint { display: block; }
    }
  `;
  document.head.appendChild(style);

  /* ---------- elements ---------- */
  function makeEl(tag, id, className, text) {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (className) el.className = className;
    if (text) el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  const zone = makeEl('div', 'touch-zone-left');
  const base = makeEl('div', 'stick-base');
  const nub = makeEl('div', 'stick-nub');
  const btnSwing = makeEl('div', 'btn-swing', 'touch-btn', 'SWING');
  const btnCuff = makeEl('div', 'btn-cuff', 'touch-btn', 'CUFF');
  const btnWhistle = makeEl('div', 'btn-whistle', 'touch-btn', 'WHISTLE');
  makeEl('div', 'rotate-hint', null, 'Tip: turn your device sideways for the best view');

  // game.js calls this when the whistle is unlocked / on a new game.
  window.updateWhistleButton = (unlocked) => {
    btnWhistle.style.display = unlocked ? 'flex' : 'none';
  };

  /* Any first press also acts as "Enter" (start/restart) and unlocks audio. */
  function pressStart() {
    startPressed = true;
    sfx.unlock();
  }

  /* ---------- floating joystick ---------- */
  const RADIUS = 48;   // max nub travel, px
  const DEAD = 10;     // ignore tiny wiggles
  const AXIS = 0.42;   // how far off-axis still counts as that direction
  let stickId = null, originX = 0, originY = 0;

  function positionStick(x, y, nx, ny) {
    base.style.left = x + 'px';
    base.style.top = y + 'px';
    nub.style.left = nx + 'px';
    nub.style.top = ny + 'px';
    base.style.display = 'block';
    nub.style.display = 'block';
  }

  function clearDirs() {
    input.up = input.down = input.left = input.right = false;
  }

  function releaseStick() {
    stickId = null;
    base.style.display = 'none';
    nub.style.display = 'none';
    clearDirs();
  }

  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    positionStick(originX, originY, originX, originY);
    pressStart();
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
    positionStick(originX, originY, originX + dx, originY + dy);
    if (len < DEAD) { clearDirs(); return; }
    const nx = dx / len, ny = dy / len;
    input.left = nx < -AXIS;
    input.right = nx > AXIS;
    input.up = ny < -AXIS;
    input.down = ny > AXIS;
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === stickId) releaseStick();
  });
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === stickId) releaseStick();
  });

  /* ---------- action buttons (hold = gentle auto-repeat) ---------- */
  function bindHoldButton(btn, setFlag) {
    let repeat = null;
    const down = (e) => {
      e.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      btn.classList.add('held');
      pressStart();
      setFlag();
      repeat = setInterval(setFlag, 110);
    };
    const up = () => {
      btn.classList.remove('held');
      if (repeat !== null) clearInterval(repeat);
      repeat = null;
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  bindHoldButton(btnSwing, () => { attackPressed = true; });
  bindHoldButton(btnCuff, () => { cuffPressed = true; });

  /* Whistle is a single tap (it has a long cooldown, no auto-repeat needed). */
  function bindTapButton(btn, fn) {
    const down = (e) => {
      e.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      btn.classList.add('held');
      pressStart();
      fn();
    };
    const up = () => btn.classList.remove('held');
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  bindTapButton(btnWhistle, () => { whistlePressed = true; });

  /* Tapping the game itself (right half, outside the buttons) also starts. */
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressStart();
  });
})();
