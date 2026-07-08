'use strict';
/* ==========================================================================
   audio.js — tiny generated sound effects via WebAudio (no asset files).
   The AudioContext is created lazily on the first user input, which is
   required by browser autoplay policies.
   ========================================================================== */

const sfx = (() => {
  let ctx = null;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One short enveloped tone.
  function tone(freq, dur, type, vol, when, slideTo) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ac(); },
    swing()   { tone(300, 0.08, 'sawtooth', 0.06, 0, 900); },
    hit()     { tone(220, 0.12, 'square', 0.18, 0, 90); },
    cuff()    { tone(1200, 0.05, 'square', 0.12); tone(900, 0.06, 'square', 0.12, 0.07); },
    fade()    { tone(700, 0.25, 'triangle', 0.1, 0, 200); },
    hurt()    { tone(160, 0.2, 'sawtooth', 0.2, 0, 60); },
    wake()    { tone(200, 0.1, 'square', 0.1, 0, 500); },
    loseLife(){ tone(300, 0.25, 'triangle', 0.2, 0, 80); tone(150, 0.4, 'triangle', 0.2, 0.2, 60); },
    whistle() {
      tone(1400, 0.14, 'sine', 0.16, 0, 2600);
      tone(2100, 0.16, 'sine', 0.12, 0.08, 2600);
    },
    bossAppear() {
      [140, 116, 98].forEach((f, i) => tone(f, 0.32, 'sawtooth', 0.2, i * 0.14, f * 0.9));
    },
    levelUp() {
      [523, 659, 784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.13, i * 0.1));
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.12, i * 0.14));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, i * 0.2));
    },
  };
})();
