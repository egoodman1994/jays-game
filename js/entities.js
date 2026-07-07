'use strict';
/* ==========================================================================
   entities.js — player (Officer Pup), enemies (cat burglars), collision,
   and all procedural character drawing. No image assets are used; every
   character is drawn with canvas shapes so the game has zero dependencies.
   ========================================================================== */

/* ---------- tile collision helpers ---------- */

function tileSolid(grid, tx, ty) {
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return true;
  return grid[ty][tx] !== T_FLOOR;
}

function rectHitsSolid(grid, x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileSolid(grid, tx, ty)) return true;
    }
  }
  return false;
}

/* Move an entity with axis-separated collision. Returns nothing; mutates e. */
function moveWithCollision(e, dx, dy, grid) {
  if (dx !== 0) {
    let nx = e.x + dx;
    if (!rectHitsSolid(grid, nx, e.y, e.w, e.h)) e.x = nx;
  }
  if (dy !== 0) {
    let ny = e.y + dy;
    if (!rectHitsSolid(grid, e.x, ny, e.w, e.h)) e.y = ny;
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function centerOf(e) { return { x: e.x + e.w / 2, y: e.y + e.h / 2 }; }

function distBetween(a, b) {
  const ca = centerOf(a), cb = centerOf(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

/* ---------- Player ---------- */

const PLAYER_SPEED = 190;      // px/s
const SWING_MS = 220;          // baton swing duration
const SWING_COOLDOWN_MS = 120; // gap before next swing

class Player {
  constructor() {
    this.w = 34; this.h = 34;
    this.x = 0; this.y = 0;
    this.facing = 'down';
    this.hearts = MAX_HEARTS;
    this.lives = START_LIVES;
    this.invulnT = 0;      // ms of invulnerability remaining
    this.swingT = 0;       // ms remaining in current swing
    this.cooldownT = 0;
    this.cuffT = 0;        // ms remaining in cuffing animation
    this.cuffTarget = null;
    this.walkPhase = 0;    // for leg bobbing
    this.moving = false;
  }

  placeAtRoomCenter() {
    this.x = (COLS / 2) * TILE - this.w / 2;
    this.y = (ROWS / 2) * TILE - this.h / 2;
  }

  get busy() { return this.cuffT > 0; }

  startSwing() {
    if (this.swingT > 0 || this.cooldownT > 0 || this.busy) return false;
    this.swingT = SWING_MS;
    this.hitThisSwing = new Set();
    sfx.swing();
    return true;
  }

  /* Rectangle covered by the baton during a swing. */
  batonHitbox() {
    const reach = 46, width = 50;
    const c = centerOf(this);
    switch (this.facing) {
      case 'up':    return { x: c.x - width / 2, y: this.y - reach, w: width, h: reach };
      case 'down':  return { x: c.x - width / 2, y: this.y + this.h, w: width, h: reach };
      case 'left':  return { x: this.x - reach, y: c.y - width / 2, w: reach, h: width };
      case 'right': return { x: this.x + this.w, y: c.y - width / 2, w: reach, h: width };
    }
  }

  update(dt, input, grid) {
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.cooldownT > 0) this.cooldownT -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    if (this.swingT < 0) { this.swingT = 0; this.cooldownT = SWING_COOLDOWN_MS; }

    if (this.cuffT > 0) {
      this.cuffT -= dt;
      this.moving = false;
      return; // stand still while cuffing
    }

    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    this.moving = (dx !== 0 || dy !== 0);
    if (this.moving) {
      // Facing follows the dominant axis; horizontal wins ties.
      if (dx !== 0) this.facing = dx > 0 ? 'right' : 'left';
      if (dy !== 0 && dx === 0) this.facing = dy > 0 ? 'down' : 'up';
      const len = Math.hypot(dx, dy);
      const step = PLAYER_SPEED * (dt / 1000);
      moveWithCollision(this, (dx / len) * step, (dy / len) * step, grid);
      this.walkPhase += dt * 0.012;
    }
  }
}

/* ---------- Enemy: cat burglar ---------- */

const E_ACTIVE = 'active';
const E_KO = 'ko';           // unconscious
const E_CUFFED = 'cuffed';   // fading away
const E_GONE = 'gone';

const CAT_CHASE_SPEED = 100;
const CAT_WANDER_SPEED = 45;
const CAT_SIGHT = 260;

// Scaled up each level by game.js so later loops feel faster/harder.
let ENEMY_SPEED_MULT = 1;

class Enemy {
  constructor(tx, ty) {
    this.w = 34; this.h = 34;
    this.spawnX = tx * TILE + (TILE - this.w) / 2;
    this.spawnY = ty * TILE + (TILE - this.h) / 2;
    this.x = this.spawnX; this.y = this.spawnY;
    this.state = E_ACTIVE;
    this.koT = 0;            // ms remaining unconscious
    this.fadeT = 0;          // ms remaining in fade-out
    this.stunT = 0;          // ms remaining frozen by the whistle
    this.wanderT = 0;
    this.wanderDir = { x: 0, y: 0 };
    this.knock = null;       // {x, y, t} knockback impulse
    this.animT = Math.random() * 1000;
  }

  knockOut() {
    this.state = E_KO;
    this.koT = UNCONSCIOUS_MS;
    sfx.hit();
  }

  startCuff() {
    // handled by game.js via player.cuffT; enemy just waits in KO state
  }

  finishCuff() {
    this.state = E_CUFFED;
    this.fadeT = FADE_TIME_MS;
    sfx.fade();
  }

  wakeUp() {
    this.state = E_ACTIVE;
    this.koT = 0;
    sfx.wake();
  }

  update(dt, player, grid) {
    this.animT += dt;
    if (this.stunT > 0) this.stunT -= dt;

    if (this.state === E_CUFFED) {
      this.fadeT -= dt;
      if (this.fadeT <= 0) this.state = E_GONE;
      return;
    }
    if (this.state === E_KO) {
      if (this.stunT <= 0) this.koT -= dt;   // whistle stun pauses the wake timer
      if (this.koT <= 0) this.wakeUp();
      return;
    }
    if (this.state !== E_ACTIVE) return;
    if (this.stunT > 0) return;   // frozen in place by the whistle

    // Knockback from a baton hit that didn't land (grazes) or future use
    if (this.knock) {
      this.knock.t -= dt;
      moveWithCollision(this, this.knock.x * dt / 1000, this.knock.y * dt / 1000, grid);
      if (this.knock.t <= 0) this.knock = null;
      return;
    }

    const d = distBetween(this, player);
    const step = dt / 1000;
    if (d < CAT_SIGHT && player.hearts > 0) {
      // chase
      const pc = centerOf(player), ec = centerOf(this);
      const len = Math.max(1, Math.hypot(pc.x - ec.x, pc.y - ec.y));
      moveWithCollision(this,
        ((pc.x - ec.x) / len) * CAT_CHASE_SPEED * ENEMY_SPEED_MULT * step,
        ((pc.y - ec.y) / len) * CAT_CHASE_SPEED * ENEMY_SPEED_MULT * step, grid);
    } else {
      // wander
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 800 + Math.random() * 1400;
        const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:0,y:0}];
        this.wanderDir = dirs[Math.floor(Math.random() * dirs.length)];
      }
      moveWithCollision(this,
        this.wanderDir.x * CAT_WANDER_SPEED * ENEMY_SPEED_MULT * step,
        this.wanderDir.y * CAT_WANDER_SPEED * ENEMY_SPEED_MULT * step, grid);
    }
  }
}

/* ---------- Boss: the big orange brute ---------- */

const BOSS_HIT_FLASH_MS = 180;

class Boss {
  constructor(level) {
    this.w = 62; this.h = 62;
    this.x = 0; this.y = 0;
    this.level = level;
    this.maxHp = 3 + level * 2;      // L1:5, L2:7, L3:9 baton hits
    this.hp = this.maxHp;
    this.speed = 100 + level * 22;   // L1:122, L2:144, L3:166 px/s
    this.state = 'active';           // 'active' | 'dead'
    this.introT = 700;               // brief roar before it charges
    this.hitFlash = 0;
    this.stunT = 0;                  // frozen by the whistle
    this.deadT = 0;                  // death animation timer
    this.animT = 0;
  }

  placeInRoom() {
    // upper-center of the arena; the player enters from a door, so this keeps distance
    this.x = (COLS / 2) * TILE - this.w / 2;
    this.y = 2 * TILE;
  }

  get gone() { return this.state === 'dead' && this.deadT <= 0; }

  hitByBaton() {
    if (this.state !== 'active' || this.introT > 0) return;
    this.hp--;
    this.hitFlash = BOSS_HIT_FLASH_MS;
    sfx.hit();
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadT = 900;
      sfx.fade();
    }
  }

  update(dt, player, grid) {
    this.animT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.state === 'dead') { this.deadT -= dt; return; }
    if (this.introT > 0) { this.introT -= dt; return; }
    if (this.stunT > 0) return;

    if (player.hearts <= 0) return;
    const step = dt / 1000;
    const pc = centerOf(player), ec = centerOf(this);
    const len = Math.max(1, Math.hypot(pc.x - ec.x, pc.y - ec.y));
    moveWithCollision(this,
      ((pc.x - ec.x) / len) * this.speed * step,
      ((pc.y - ec.y) / len) * this.speed * step, grid);
  }
}

/* ==========================================================================
   Procedural character art
   ========================================================================== */

/* Officer Pup — a floppy-eared police dog (original placeholder art). */
function drawDogman(ctx, p) {
  const cx = p.x + p.w / 2;
  const bob = p.moving ? Math.sin(p.walkPhase * 6) * 2 : 0;
  const blink = p.invulnT > 0 && Math.floor(p.invulnT / 100) % 2 === 0;
  if (blink) return; // flicker while invulnerable

  ctx.save();
  ctx.translate(cx, p.y + p.h / 2 + bob);

  // legs
  ctx.fillStyle = '#1d3f8f';
  const legSwing = p.moving ? Math.sin(p.walkPhase * 6) * 4 : 0;
  ctx.fillRect(-10, 8 + legSwing * 0.4, 8, 12);
  ctx.fillRect(2, 8 - legSwing * 0.4, 8, 12);

  // body: blue police shirt
  ctx.fillStyle = '#2b57c9';
  roundRect(ctx, -13, -6, 26, 20, 6);
  ctx.fill();
  // badge
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(-6, 1, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // head: tan dog head with brown patch
  ctx.fillStyle = '#d9a066';
  ctx.beginPath();
  ctx.arc(0, -16, 13, 0, Math.PI * 2);
  ctx.fill();

  // floppy ears
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath();
  ctx.ellipse(-12, -18, 5, 9, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12, -18, 5, 9, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // face by facing direction
  const fx = p.facing === 'left' ? -4 : p.facing === 'right' ? 4 : 0;
  if (p.facing !== 'up') {
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4 + fx, -19, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + fx, -19, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-4 + fx, -19, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + fx, -19, 1.4, 0, Math.PI * 2); ctx.fill();
    // snout + nose
    ctx.fillStyle = '#c08a4d';
    ctx.beginPath(); ctx.ellipse(fx, -12, 6.5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(fx, -14, 2.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // back of head patch
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath(); ctx.arc(0, -18, 6, 0, Math.PI * 2); ctx.fill();
  }

  // police hat
  ctx.fillStyle = '#1d3f8f';
  ctx.fillRect(-11, -30, 22, 5);
  roundRect(ctx, -8, -35, 16, 7, 3);
  ctx.fill();
  ctx.fillStyle = '#ffd23e';
  ctx.fillRect(-2, -31, 4, 3);

  ctx.restore();

  // baton (drawn outside translate for easy positioning)
  drawBaton(ctx, p);
}

function drawBaton(ctx, p) {
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  const swinging = p.swingT > 0;
  // Swing sweeps a 100-degree arc across the facing direction.
  const prog = swinging ? 1 - p.swingT / SWING_MS : 0;
  const base = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[p.facing];
  const angle = swinging ? base - 0.9 + prog * 1.8 : base + 0.7;
  const len = swinging ? 34 : 20;
  const bx = c.x + Math.cos(angle) * 12;
  const by = c.y + Math.sin(angle) * 12;
  ctx.save();
  ctx.strokeStyle = '#33261a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + Math.cos(angle) * len, by + Math.sin(angle) * len);
  ctx.stroke();
  // handle
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + Math.cos(angle) * 6, by + Math.sin(angle) * 6);
  ctx.stroke();
  ctx.restore();
}

/* Cat burglar enemy. */
function drawCat(ctx, e, now) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  ctx.save();

  if (e.state === E_CUFFED) {
    ctx.globalAlpha = Math.max(0, e.fadeT / FADE_TIME_MS);
  }

  const down = (e.state === E_KO || e.state === E_CUFFED);
  ctx.translate(cx, cy);
  if (down) ctx.rotate(Math.PI / 2); // lying on its side

  // body: dark grey with striped burglar shirt
  ctx.fillStyle = '#4a4a55';
  roundRect(ctx, -12, -4, 24, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-12, 0, 24, 3);
  ctx.fillRect(-12, 7, 24, 3);

  // head
  ctx.fillStyle = '#6e6e7a';
  ctx.beginPath();
  ctx.arc(0, -13, 11, 0, Math.PI * 2);
  ctx.fill();
  // pointy ears
  ctx.beginPath();
  ctx.moveTo(-10, -18); ctx.lineTo(-6, -27); ctx.lineTo(-2, -19); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -18); ctx.lineTo(6, -27); ctx.lineTo(2, -19); ctx.closePath(); ctx.fill();

  // burglar mask
  ctx.fillStyle = '#22222c';
  ctx.fillRect(-10, -18, 20, 6);
  if (e.state === E_ACTIVE) {
    ctx.fillStyle = '#ffe95e';
    ctx.beginPath(); ctx.arc(-5, -15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -15, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    // X eyes when unconscious
    ctx.strokeStyle = '#ffe95e';
    ctx.lineWidth = 1.6;
    [[-5, -15], [5, -15]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.moveTo(ex - 2, ey - 2); ctx.lineTo(ex + 2, ey + 2);
      ctx.moveTo(ex + 2, ey - 2); ctx.lineTo(ex - 2, ey + 2);
      ctx.stroke();
    });
  }

  // whiskers + nose
  ctx.fillStyle = '#e8a2b8';
  ctx.beginPath(); ctx.arc(0, -10, 1.8, 0, Math.PI * 2); ctx.fill();

  // tail
  ctx.strokeStyle = '#6e6e7a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const wag = Math.sin((e.animT) * 0.004) * 5;
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.quadraticCurveTo(20, 6 + wag, 18, -2 + wag);
  ctx.stroke();

  ctx.restore();

  // whistle stun swirl (over active or KO crooks alike)
  if (e.stunT > 0) drawStunOrbits(ctx, cx, cy - 26, now);

  // KO extras drawn upright above the body
  if (e.state === E_KO) {
    drawKoStars(ctx, cx, cy - 28, now);
    drawKoTimer(ctx, e, cx, cy + 26);
  }
  if (e.state === E_CUFFED) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, e.fadeT / FADE_TIME_MS);
    drawCuffs(ctx, cx, cy - 2);
    ctx.restore();
  }
}

function drawKoStars(ctx, cx, cy, now) {
  ctx.save();
  ctx.fillStyle = '#ffd23e';
  for (let i = 0; i < 3; i++) {
    const a = now * 0.004 + (i * Math.PI * 2) / 3;
    const sx = cx + Math.cos(a) * 14;
    const sy = cy + Math.sin(a) * 5;
    drawStar(ctx, sx, sy, 4);
  }
  ctx.restore();
}

function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r / 2;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* Shrinking ring showing time left before the enemy wakes up. */
function drawKoTimer(ctx, e, cx, cy) {
  const frac = Math.max(0, e.koT / UNCONSCIOUS_MS);
  const urgent = e.koT < 4000;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = urgent && Math.floor(e.koT / 200) % 2 === 0 ? '#ff5f4d' : '#7ee081';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCuffs(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = '#cfd6e4';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx - 5, cy, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 5, cy, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/* Cyan swirl shown while an enemy (or boss) is whistle-stunned. */
function drawStunOrbits(ctx, cx, cy, now) {
  ctx.save();
  ctx.fillStyle = '#8fd8ff';
  for (let i = 0; i < 3; i++) {
    const a = now * 0.012 + (i * Math.PI * 2) / 3;
    drawStar(ctx, cx + Math.cos(a) * 12, cy + Math.sin(a) * 5, 3);
  }
  ctx.restore();
}

/* The big orange boss brute. */
function drawBoss(ctx, b, now) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ctx.save();

  if (b.state === 'dead') {
    const k = Math.max(0, b.deadT / 900);
    ctx.globalAlpha = k;
    ctx.translate(cx, cy);
    ctx.scale(0.5 + 0.5 * k, 0.5 + 0.5 * k);
    ctx.rotate((1 - k) * 1.3);
    ctx.translate(-cx, -cy);
  }

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h - 4, b.w * 0.44, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = b.introT > 0 ? Math.sin(now * 0.02) * 2 : Math.sin(b.animT * 0.006) * 3;
  ctx.translate(cx, cy + bob);

  const flash = b.hitFlash > 0 && Math.floor(b.hitFlash / 45) % 2 === 0;
  const body = flash ? '#ffe0b0' : '#f07d1a';
  const dark = flash ? '#ffc080' : '#c1560a';

  // arms / fists
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(-30, 8, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, 8, 10, 0, Math.PI * 2); ctx.fill();

  // body
  ctx.fillStyle = body;
  roundRect(ctx, -27, -10, 54, 42, 15);
  ctx.fill();
  // chest plate
  ctx.fillStyle = dark;
  roundRect(ctx, -15, 2, 30, 24, 9);
  ctx.fill();

  // head
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, -27, 23, 0, Math.PI * 2); ctx.fill();
  // pointy ears
  ctx.beginPath(); ctx.moveTo(-21, -37); ctx.lineTo(-13, -57); ctx.lineTo(-4, -39); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(21, -37); ctx.lineTo(13, -57); ctx.lineTo(4, -39); ctx.closePath(); ctx.fill();

  // angry brows
  ctx.strokeStyle = '#3a1e05';
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-15, -33); ctx.lineTo(-4, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15, -33); ctx.lineTo(4, -28); ctx.stroke();
  // eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-9, -24, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(9, -24, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b.state === 'active' ? '#e11d1d' : '#7a3333';
  ctx.beginPath(); ctx.arc(-9, -23, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(9, -23, 2.3, 0, Math.PI * 2); ctx.fill();
  // snarling mouth with fangs
  ctx.fillStyle = '#3a1e05';
  roundRect(ctx, -10, -16, 20, 8, 3); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(-7, -16); ctx.lineTo(-4, -10); ctx.lineTo(-1, -16); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1, -16); ctx.lineTo(4, -10); ctx.lineTo(7, -16); ctx.closePath(); ctx.fill();

  ctx.restore();

  if (b.stunT > 0) drawStunOrbits(ctx, cx, cy - 58, now);
}

/* rounded-rect path helper */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
