'use strict';
/* ==========================================================================
   game.js — main loop, game states, room management, combat rules, HUD.
   Load order (see index.html): levels.js, audio.js, entities.js, game.js
   ========================================================================== */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

/* ---------- input ---------- */

const input = { up: false, down: false, left: false, right: false };
let attackPressed = false;
let cuffPressed = false;
let startPressed = false;

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  const dir = KEYMAP[e.key];
  if (dir) input[dir] = true;
  if (e.key === ' ' || e.key === 'z' || e.key === 'Z' || e.key === 'j') attackPressed = true;
  if (e.key === 'x' || e.key === 'X' || e.key === 'c' || e.key === 'C' || e.key === 'k') cuffPressed = true;
  if (e.key === 'Enter') startPressed = true;
  if (e.key === 'p' || e.key === 'P') togglePause();
});

window.addEventListener('keyup', (e) => {
  const dir = KEYMAP[e.key];
  if (dir) input[dir] = false;
});

/* ---------- game state ---------- */

const S_TITLE = 'title';
const S_PLAY = 'play';
const S_LIFE_LOST = 'lifeLost';
const S_GAMEOVER = 'gameOver';
const S_VICTORY = 'victory';

let state = S_TITLE;
let paused = false;
let stateTimer = 0;

let player = null;
let currentRoom = { ...START_ROOM };
let grid = null;
let roomStates = {};      // "x,y" -> { enemies: [Enemy] }
let cuffedCount = 0;
const TOTAL_ENEMIES = totalEnemyCount();

// Floor palette per room (grass for parks, pavement for city blocks)
const FLOOR_STYLE = {
  '0,0': 'grass', '1,0': 'pave', '2,0': 'pave',
  '0,1': 'grass', '1,1': 'pave', '2,1': 'pave',
  '0,2': 'grass', '1,2': 'pave', '2,2': 'pave',
};

function getRoomState(rx, ry) {
  const key = roomKey(rx, ry);
  if (!roomStates[key]) {
    const def = ROOM_DEFS[key];
    roomStates[key] = {
      enemies: def.enemies.map(([tx, ty]) => new Enemy(tx, ty)),
    };
  }
  return roomStates[key];
}

function enterRoom(rx, ry) {
  currentRoom = { x: rx, y: ry };
  grid = buildGrid(rx, ry);
  getRoomState(rx, ry);
}

function newGame() {
  player = new Player();
  roomStates = {};
  cuffedCount = 0;
  enterRoom(START_ROOM.x, START_ROOM.y);
  player.placeAtRoomCenter();
  state = S_PLAY;
  paused = false;
}

function togglePause() {
  if (state === S_PLAY) paused = !paused;
}

/* Wake every unconscious enemy (used when the player loses a life). */
function wakeAllEnemies() {
  for (const key in roomStates) {
    roomStates[key].enemies.forEach((e) => {
      if (e.state === E_KO) { e.state = E_ACTIVE; e.koT = 0; }
    });
  }
}

/* ---------- update ---------- */

function update(dt) {
  if (state === S_TITLE || state === S_GAMEOVER || state === S_VICTORY) {
    if (startPressed) newGame();
    return;
  }

  if (state === S_LIFE_LOST) {
    stateTimer -= dt;
    if (stateTimer <= 0) {
      // respawn at the police station with full hearts
      enterRoom(START_ROOM.x, START_ROOM.y);
      player.placeAtRoomCenter();
      player.hearts = MAX_HEARTS;
      player.invulnT = 2000;
      wakeAllEnemies();
      state = S_PLAY;
    }
    return;
  }

  if (paused) return;

  const room = getRoomState(currentRoom.x, currentRoom.y);

  // -- player actions --
  if (attackPressed) player.startSwing();
  if (cuffPressed && !player.busy && player.swingT <= 0) tryStartCuff(room);

  player.update(dt, input, grid);

  // finish cuffing
  if (player.cuffTarget && player.cuffT <= 0) {
    const target = player.cuffTarget;
    player.cuffTarget = null;
    if (target.state === E_KO) {
      target.finishCuff();
      cuffedCount++;
      if (cuffedCount >= TOTAL_ENEMIES) {
        state = S_VICTORY;
        sfx.win();
        return;
      }
    }
  }

  // -- enemies --
  const swing = player.swingT > 0 ? player.batonHitbox() : null;
  for (const e of room.enemies) {
    e.update(dt, player, grid);

    // baton hits
    if (swing && e.state === E_ACTIVE && !player.hitThisSwing.has(e) && rectsOverlap(swing, e)) {
      player.hitThisSwing.add(e);
      e.knockOut();
    }

    // contact damage
    if (e.state === E_ACTIVE && player.invulnT <= 0 && rectsOverlap(e, player)) {
      damagePlayer(e);
      if (state !== S_PLAY) return;
    }
  }

  checkRoomTransition();
}

function tryStartCuff(room) {
  let best = null, bestD = Infinity;
  for (const e of room.enemies) {
    if (e.state !== E_KO) continue;
    const d = distBetween(player, e);
    if (d < CUFF_RANGE && d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    player.cuffT = CUFF_TIME_MS;
    player.cuffTarget = best;
    // don't let the enemy wake up mid-cuff
    best.koT = Math.max(best.koT, CUFF_TIME_MS + 100);
    sfx.cuff();
  }
}

function damagePlayer(enemy) {
  player.hearts--;
  player.invulnT = INVULN_MS;
  sfx.hurt();
  // knock the player back away from the enemy
  const pc = centerOf(player), ec = centerOf(enemy);
  const len = Math.max(1, Math.hypot(pc.x - ec.x, pc.y - ec.y));
  moveWithCollision(player, ((pc.x - ec.x) / len) * 28, ((pc.y - ec.y) / len) * 28, grid);

  if (player.hearts <= 0) {
    player.lives--;
    // cancel any in-progress cuff
    player.cuffT = 0;
    player.cuffTarget = null;
    if (player.lives <= 0) {
      state = S_GAMEOVER;
      sfx.gameOver();
    } else {
      state = S_LIFE_LOST;
      stateTimer = 1600;
      sfx.loseLife();
    }
  }
}

function checkRoomTransition() {
  const margin = 4;
  let nx = currentRoom.x, ny = currentRoom.y, moved = false;
  if (player.x < margin && hasRoom(currentRoom.x - 1, currentRoom.y)) {
    nx--; moved = true;
  } else if (player.x + player.w > VIEW_W - margin && hasRoom(currentRoom.x + 1, currentRoom.y)) {
    nx++; moved = true;
  } else if (player.y < margin && hasRoom(currentRoom.x, currentRoom.y - 1)) {
    ny--; moved = true;
  } else if (player.y + player.h > ROWS * TILE - margin && hasRoom(currentRoom.x, currentRoom.y + 1)) {
    ny++; moved = true;
  }
  if (moved) {
    const fromX = currentRoom.x, fromY = currentRoom.y;
    enterRoom(nx, ny);
    // place the player just inside the matching door of the new room
    if (nx < fromX) player.x = VIEW_W - TILE - player.w - 4;
    if (nx > fromX) player.x = TILE + 4;
    if (ny < fromY) player.y = ROWS * TILE - TILE - player.h - 4;
    if (ny > fromY) player.y = TILE + 4;
  }
}

/* ---------- rendering ---------- */

function draw(now) {
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (state === S_TITLE) { drawTitle(); return; }

  drawHUD();

  ctx.save();
  ctx.translate(0, HUD_H);
  drawRoom(now);
  const room = getRoomState(currentRoom.x, currentRoom.y);
  // draw KO'd enemies under active ones, player on top
  room.enemies.filter(e => e.state !== E_GONE && e.state !== E_ACTIVE)
    .forEach(e => drawCat(ctx, e, now));
  room.enemies.filter(e => e.state === E_ACTIVE)
    .forEach(e => drawCat(ctx, e, now));
  if (state !== S_LIFE_LOST) drawDogman(ctx, player);
  drawCuffPrompt(room);
  ctx.restore();

  if (paused) drawOverlayText('PAUSED', 'Press P to resume');
  if (state === S_LIFE_LOST) drawOverlayText('OUCH!', `Lives left: ${player.lives}`);
  if (state === S_GAMEOVER) drawOverlayText('GAME OVER', 'Press ENTER to try again');
  if (state === S_VICTORY) drawOverlayText('CITY SAVED!', `All ${TOTAL_ENEMIES} crooks cuffed! Press ENTER to play again`);
}

function drawRoom(now) {
  const style = FLOOR_STYLE[roomKey(currentRoom.x, currentRoom.y)] || 'grass';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      // floor (checkerboard shading)
      const alt = (r + c) % 2 === 0;
      if (style === 'grass') {
        ctx.fillStyle = alt ? '#69a84f' : '#63a24a';
      } else {
        ctx.fillStyle = alt ? '#9b9b9b' : '#949494';
      }
      ctx.fillRect(x, y, TILE, TILE);

      const t = grid[r][c];
      if (t === T_ROCK) {
        ctx.fillStyle = '#6f6f78';
        roundRect(ctx, x + 4, y + 4, TILE - 8, TILE - 8, 10);
        ctx.fill();
        ctx.fillStyle = '#8b8b95';
        roundRect(ctx, x + 8, y + 8, TILE - 20, TILE - 22, 8);
        ctx.fill();
      } else if (t === T_TREE) {
        ctx.fillStyle = '#7a4a21';
        ctx.fillRect(x + TILE / 2 - 4, y + TILE / 2, 8, TILE / 2 - 4);
        ctx.fillStyle = '#2f7a33';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2 - 6, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f9a43';
        ctx.beginPath();
        ctx.arc(x + TILE / 2 - 5, y + TILE / 2 - 11, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === T_CRATE) {
        ctx.fillStyle = '#a5702f';
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        ctx.strokeStyle = '#7c521f';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 6, y + 6, TILE - 12, TILE - 12);
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + TILE - 6, y + TILE - 6);
        ctx.moveTo(x + TILE - 6, y + 6); ctx.lineTo(x + 6, y + TILE - 6);
        ctx.stroke();
      }
    }
  }
}

/* "Press X" hint when standing near an unconscious enemy. */
function drawCuffPrompt(room) {
  if (player.busy) return;
  for (const e of room.enemies) {
    if (e.state === E_KO && distBetween(player, e) < CUFF_RANGE) {
      const c = centerOf(e);
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, c.x - 40, e.y - 34, 80, 18, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(window.IS_TOUCH ? 'CUFF!' : 'X: cuff!', c.x, e.y - 21);
      ctx.restore();
      return;
    }
  }
}

function drawHUD() {
  ctx.fillStyle = '#14141f';
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.strokeStyle = '#2c2c40';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, VIEW_W - 2, HUD_H - 2);

  // hearts
  for (let i = 0; i < MAX_HEARTS; i++) {
    drawHeart(ctx, 24 + i * 26, 22, 10, i < player.hearts);
  }
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#aab';
  ctx.textAlign = 'left';
  ctx.fillText('HEARTS', 24, 48);

  // lives
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('LIVES x' + player.lives, 190, 27);
  ctx.fillStyle = '#aab';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('OFFICER PUP', 190, 48);

  // cuffed counter
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7ee081';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`CUFFED ${cuffedCount}/${TOTAL_ENEMIES}`, VIEW_W - 24, 27);

  // room name
  ctx.fillStyle = '#aab';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(ROOM_DEFS[roomKey(currentRoom.x, currentRoom.y)].name.toUpperCase(), VIEW_W - 24, 48);
  ctx.textAlign = 'left';
}

function drawHeart(ctx, x, y, r, full) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.35);
  ctx.bezierCurveTo(-r, -r * 0.6, -r * 0.5, -r * 1.2, 0, -r * 0.4);
  ctx.bezierCurveTo(r * 0.5, -r * 1.2, r, -r * 0.6, 0, r * 0.35);
  ctx.lineTo(0, r);
  ctx.closePath();
  if (full) {
    ctx.fillStyle = '#ff4d5e';
    ctx.fill();
  } else {
    ctx.strokeStyle = '#5a3a44';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawOverlayText(big, small) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, HUD_H, VIEW_W, VIEW_H - HUD_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px monospace';
  ctx.fillText(big, VIEW_W / 2, VIEW_H / 2 - 6);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(small, VIEW_W / 2, VIEW_H / 2 + 32);
  ctx.restore();
}

function drawTitle() {
  ctx.fillStyle = '#17203a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 52px monospace';
  ctx.fillText('BATON PATROL', VIEW_W / 2, 130);
  ctx.fillStyle = '#8fb4ff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Starring Officer Pup, Supa Cop', VIEW_W / 2, 168);

  // big preview of the hero
  const preview = new Player();
  preview.x = VIEW_W / 2 - 17;
  preview.y = 220;
  ctx.save();
  ctx.translate(VIEW_W / 2, 260);
  ctx.scale(2.2, 2.2);
  ctx.translate(-VIEW_W / 2, -260);
  drawDogman(ctx, preview);
  ctx.restore();

  ctx.fillStyle = '#dfe6ff';
  ctx.font = 'bold 16px monospace';
  const lines = [
    'ARROWS / WASD ........ move',
    'SPACE or Z ........... swing baton (knock out crooks)',
    'X or C ............... handcuff an unconscious crook',
    'P .................... pause',
    '',
    'Cuff them within 15 seconds or they wake back up!',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 350 + i * 24));

  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#7ee081';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(window.IS_TOUCH ? 'TAP TO START' : 'PRESS ENTER TO START', VIEW_W / 2, VIEW_H - 28);
  }
  ctx.textAlign = 'left';
}

/* ---------- main loop ---------- */

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(50, now - lastTime); // clamp long tab-away frames
  lastTime = now;
  update(dt);
  attackPressed = false;
  cuffPressed = false;
  startPressed = false;
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
