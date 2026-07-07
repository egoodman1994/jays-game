'use strict';
/* ==========================================================================
   levels.js — world constants and room definitions
   The world is a 3x3 grid of single-screen rooms (Zelda 1 style).
   Each room lists its decorations (solid tiles) and enemy spawn points.
   Coordinates in room defs are TILE coordinates (interior is 1..14 x 1..8).
   ========================================================================== */

const TILE = 48;
const COLS = 16;
const ROWS = 10;
const HUD_H = 64;
const VIEW_W = COLS * TILE;            // 768
const VIEW_H = ROWS * TILE + HUD_H;    // 544

const WORLD_W = 3;
const WORLD_H = 3;
const START_ROOM = { x: 1, y: 1 };

// Tile ids
const T_FLOOR = 0;
const T_ROCK = 1;
const T_TREE = 2;
const T_CRATE = 3;

// Gameplay tuning
const MAX_HEARTS = 5;
const START_LIVES = 3;
const UNCONSCIOUS_MS = 15000;   // time before a knocked-out enemy wakes up
const CUFF_RANGE = 56;          // px, how close the player must be to cuff
const CUFF_TIME_MS = 500;       // cuffing animation
const FADE_TIME_MS = 900;       // cuffed enemy fade-out
const INVULN_MS = 1200;         // player i-frames after taking damage

/*
  Room defs keyed by "x,y" in the world grid.
  rocks / trees / crates: [tileX, tileY] solid decorations.
  enemies: [tileX, tileY] spawn points (cat burglars).
*/
const ROOM_DEFS = {
  '1,1': {
    name: 'Police Station Plaza',
    trees: [[2, 2], [13, 2], [2, 7], [13, 7]],
    rocks: [],
    crates: [],
    enemies: [], // safe starting room
  },
  '0,1': {
    name: 'City Park',
    trees: [[3, 2], [4, 2], [3, 3], [11, 6], [12, 6], [12, 7], [7, 4], [8, 5]],
    rocks: [],
    crates: [],
    enemies: [[5, 7], [11, 2]],
  },
  '2,1': {
    name: 'Downtown Alley',
    trees: [],
    rocks: [[4, 2], [4, 3], [11, 6], [11, 7]],
    crates: [[7, 2], [8, 7], [12, 3]],
    enemies: [[6, 6], [12, 2], [9, 4]],
  },
  '1,0': {
    name: 'Main Street North',
    trees: [[2, 2], [13, 7]],
    rocks: [[6, 3], [9, 3], [6, 6], [9, 6]],
    crates: [],
    enemies: [[3, 6], [12, 3], [8, 8]],
  },
  '0,0': {
    name: 'Northwest Park',
    trees: [[3, 3], [4, 3], [5, 3], [10, 6], [11, 6], [12, 6], [7, 2], [8, 7]],
    rocks: [],
    crates: [],
    enemies: [[12, 2], [3, 7]],
  },
  '2,0': {
    name: 'Warehouse Row',
    trees: [],
    rocks: [[3, 2], [3, 7]],
    crates: [[6, 2], [7, 2], [10, 6], [11, 6], [12, 2], [5, 7]],
    enemies: [[9, 3], [4, 5], [12, 7]],
  },
  '0,2': {
    name: 'Riverside',
    trees: [[2, 3], [3, 6], [12, 2], [13, 5]],
    rocks: [[6, 4], [7, 4], [8, 5], [9, 5]],
    crates: [],
    enemies: [[11, 7], [4, 2]],
  },
  '1,2': {
    name: 'Market Square',
    trees: [[2, 2], [13, 2]],
    rocks: [],
    crates: [[5, 3], [6, 3], [9, 6], [10, 6], [7, 5], [12, 4]],
    enemies: [[3, 6], [12, 7], [8, 2]],
  },
  '2,2': {
    name: 'Robo-Lab Lot',
    trees: [],
    rocks: [[4, 3], [5, 3], [10, 3], [11, 3], [4, 6], [11, 6]],
    crates: [[7, 7], [8, 2]],
    enemies: [[3, 2], [12, 2], [3, 7], [12, 7]],
  },
};

function roomKey(x, y) { return x + ',' + y; }

function hasRoom(x, y) {
  return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && !!ROOM_DEFS[roomKey(x, y)];
}

// Door openings are two tiles wide, centered on each shared edge.
const DOOR_COLS = [7, 8];  // top/bottom doors
const DOOR_ROWS = [4, 5];  // left/right doors

/* Build the collision/tile grid for a room. */
function buildGrid(rx, ry) {
  const def = ROOM_DEFS[roomKey(rx, ry)];
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid.push(new Array(COLS).fill(T_FLOOR));
  }
  // Border walls
  for (let c = 0; c < COLS; c++) { grid[0][c] = T_ROCK; grid[ROWS - 1][c] = T_ROCK; }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = T_ROCK; grid[r][COLS - 1] = T_ROCK; }
  // Carve doors toward existing neighbors
  if (hasRoom(rx, ry - 1)) DOOR_COLS.forEach(c => grid[0][c] = T_FLOOR);
  if (hasRoom(rx, ry + 1)) DOOR_COLS.forEach(c => grid[ROWS - 1][c] = T_FLOOR);
  if (hasRoom(rx - 1, ry)) DOOR_ROWS.forEach(r => grid[r][0] = T_FLOOR);
  if (hasRoom(rx + 1, ry)) DOOR_ROWS.forEach(r => grid[r][COLS - 1] = T_FLOOR);
  // Decorations
  (def.trees || []).forEach(([c, r]) => grid[r][c] = T_TREE);
  (def.rocks || []).forEach(([c, r]) => grid[r][c] = T_ROCK);
  (def.crates || []).forEach(([c, r]) => grid[r][c] = T_CRATE);
  return grid;
}

function totalEnemyCount() {
  let n = 0;
  for (const key in ROOM_DEFS) n += ROOM_DEFS[key].enemies.length;
  return n;
}
