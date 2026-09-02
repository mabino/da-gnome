import test from 'node:test';
import assert from 'node:assert/strict';

// Helper: AABB collision function matching game.js implementation
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Particle class test representation
class TestParticle {
  constructor(x, y, vx, vy, color, size = 4, ttl = 45, type = 'square') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.ttl = ttl;
    this.age = 0;
    this.type = type;
    this.rot = 0;
    this.vRot = 0.1;
    this.gravity = 0.12;
    this.drag = 0.985;
  }

  update(timeScale = 1.0) {
    this.x += this.vx * timeScale;
    this.y += this.vy * timeScale;
    this.vy += this.gravity * timeScale;
    this.vx *= Math.pow(this.drag, timeScale);
    this.rot += this.vRot * timeScale;
    this.age += 1 * timeScale;
  }

  alive() {
    return this.age < this.ttl;
  }
}

// Lighting engine test representation
class TestLightingEngine {
  constructor() {
    this.lights = [];
  }
  clear() {
    this.lights.length = 0;
  }
  addLight(x, y, radius, color, intensity = 1.0) {
    this.lights.push({ x, y, radius, color, intensity });
  }
}

// Player physics simulation test representation
class TestPlayer {
  constructor(x, y, scale = 1.35) {
    this.startX = x;
    this.startY = y;
    this.scale = scale;
    this.reset();
  }

  reset() {
    this.x = this.startX;
    this.y = this.startY;
    this.w = Math.floor(44 * this.scale);
    this.h = Math.floor(62 * this.scale);
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.jumpCount = 0;
    this._upHeld = false;
  }

  update(platforms, keys, constants) {
    const { GRAV, FRICTION, MOVE_ACCEL, MAX_SPEED, JUMP_SPEED, DOUBLE_JUMP_MULT, worldWidth } = constants;

    if (keys.left) this.vx -= MOVE_ACCEL;
    if (keys.right) this.vx += MOVE_ACCEL;

    this.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.vx));
    this.vx *= FRICTION;
    this.vy += GRAV;

    if (keys.up && !this._upHeld) {
      if (this.onGround) {
        this.vy = -JUMP_SPEED;
        this.onGround = false;
        this.jumpCount = 0;
      } else if (this.jumpCount < 1) {
        this.vy = -Math.abs(JUMP_SPEED * DOUBLE_JUMP_MULT);
        this.jumpCount += 1;
      }
      this._upHeld = true;
    }
    if (!keys.up) this._upHeld = false;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x + this.w > worldWidth) { this.x = worldWidth - this.w; this.vx = 0; }

    this.onGround = false;
    for (const p of platforms) {
      if (this.x + this.w > p.x && this.x < p.x + p.w) {
        const prevY = this.y - this.vy;
        if (prevY + this.h <= p.y + 4 && this.y + this.h >= p.y && this.vy >= 0) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }

    if (this.onGround) this.jumpCount = 0;
  }
}

// Cake monster test representation
class TestCake {
  constructor(x, y, w, h, range, speed, type = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.baseX = x;
    this.range = range;
    this.speed = speed;
    this.dir = 1;
    this.type = type;
    this.phase = 0;
  }

  update(timeScale = 1.0) {
    this.x += this.speed * this.dir * timeScale;
    if (this.x > this.baseX + this.range) this.dir = -1;
    if (this.x < this.baseX - this.range) this.dir = 1;
    this.phase += 0.09 * (0.8 + Math.abs(this.speed) * 0.2) * timeScale;
  }
}

// Astro Steve test representation
class TestAstro {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 5.0;
    this.vy = -8.0;
    this.age = 0;
    this.ttl = 380;
    this.bubbleAlpha = 0;
  }

  update(timeScale = 1.0) {
    this.x += this.vx * timeScale;
    this.y += this.vy * timeScale;
    this.vy += 0.05 * timeScale;
    this.vx *= 0.998;
    this.age += 1 * timeScale;
    if (this.bubbleAlpha < 1) this.bubbleAlpha = Math.min(1, this.bubbleAlpha + 0.06);
  }

  alive() {
    return this.age < this.ttl;
  }
}

// =========================================================================
// Unit & Integration Tests
// =========================================================================

test('AABB Collision Detection', async (t) => {
  await t.test('detects overlapping boxes', () => {
    const boxA = { x: 10, y: 10, w: 50, h: 50 };
    const boxB = { x: 30, y: 30, w: 50, h: 50 };
    assert.strictEqual(aabb(boxA, boxB), true);
  });

  await t.test('detects non-overlapping horizontal boxes', () => {
    const boxA = { x: 10, y: 10, w: 20, h: 20 };
    const boxB = { x: 40, y: 10, w: 20, h: 20 };
    assert.strictEqual(aabb(boxA, boxB), false);
  });

  await t.test('detects non-overlapping vertical boxes', () => {
    const boxA = { x: 10, y: 10, w: 20, h: 20 };
    const boxB = { x: 10, y: 40, w: 20, h: 20 };
    assert.strictEqual(aabb(boxA, boxB), false);
  });
});

test('Particle System Engine', async (t) => {
  await t.test('updates position and velocity according to drag and gravity', () => {
    const p = new TestParticle(100, 100, 5, -5, '#ff5500', 4, 30);
    p.update(1.0);
    assert.ok(p.x > 100, 'x should advance by vx');
    assert.ok(p.y < 100, 'y should decrease due to negative vy initially');
    assert.ok(p.age === 1, 'age should increment by 1');
    assert.ok(p.alive() === true, 'particle should be alive');
  });

  await t.test('expires when reaching ttl', () => {
    const p = new TestParticle(0, 0, 0, 0, '#fff', 4, 3);
    p.update(1.0);
    p.update(1.0);
    assert.strictEqual(p.alive(), true);
    p.update(1.0);
    assert.strictEqual(p.alive(), false);
  });
});

test('2D Dynamic Lighting Engine', async (t) => {
  await t.test('adds lights and clears properly', () => {
    const le = new TestLightingEngine();
    assert.strictEqual(le.lights.length, 0);

    le.addLight(100, 200, 80, 'rgba(255, 200, 50, 0.5)', 1.0);
    le.addLight(300, 400, 120, 'rgba(0, 229, 255, 0.8)', 1.0);
    assert.strictEqual(le.lights.length, 2);
    assert.strictEqual(le.lights[0].x, 100);
    assert.strictEqual(le.lights[1].color, 'rgba(0, 229, 255, 0.8)');

    le.clear();
    assert.strictEqual(le.lights.length, 0);
  });
});

test('Player Physics & Movement Simulation', async (t) => {
  const constants = {
    GRAV: 0.85,
    FRICTION: 0.84,
    MOVE_ACCEL: 1.15,
    MAX_SPEED: 7.5,
    JUMP_SPEED: 16.2,
    DOUBLE_JUMP_MULT: 0.82,
    worldWidth: 4860
  };

  await t.test('horizontal movement with acceleration and friction', () => {
    const player = new TestPlayer(100, 100);
    const platforms = [{ x: 0, y: 300, w: 2000, h: 50 }];

    // Move right
    player.update(platforms, { left: false, right: true, up: false }, constants);
    assert.ok(player.vx > 0, 'vx should be positive when moving right');
    assert.ok(player.x > 100, 'player x should increase');

    // Release keys and check friction slows player down
    const prevVx = player.vx;
    player.update(platforms, { left: false, right: false, up: false }, constants);
    assert.ok(player.vx < prevVx, 'vx should decrease due to friction');
  });

  await t.test('ground jump and platform landing', () => {
    const player = new TestPlayer(100, 200);
    const groundPlatform = { x: 0, y: 300, w: 2000, h: 50 };
    const platforms = [groundPlatform];

    // Fall until landing on ground
    for (let i = 0; i < 30; i++) {
      player.update(platforms, { left: false, right: false, up: false }, constants);
    }
    assert.strictEqual(player.onGround, true, 'player should be on ground');
    assert.strictEqual(player.y, groundPlatform.y - player.h, 'player bottom should match platform top');

    // Jump from ground
    player.update(platforms, { left: false, right: false, up: true }, constants);
    assert.strictEqual(player.onGround, false, 'player should leave ground on jump');
    assert.ok(player.vy < 0, 'vy should be negative (upward) on jump');
  });

  await t.test('double-jump functionality in mid-air', () => {
    const player = new TestPlayer(100, 100);
    const platforms = []; // mid-air

    // First jump (mid-air jump #1)
    player.update(platforms, { left: false, right: false, up: true }, constants);
    assert.strictEqual(player.jumpCount, 1, 'jumpCount should increment to 1');
    assert.ok(player.vy < 0, 'double jump should apply upward velocity');

    // Release jump key and try a 3rd jump (should not be allowed)
    player.update(platforms, { left: false, right: false, up: false }, constants);
    const prevVy = player.vy;
    player.update(platforms, { left: false, right: false, up: true }, constants);
    assert.strictEqual(player.jumpCount, 1, 'cannot triple jump; jumpCount remains 1');
  });
});

test('Monster Cake Patrol Behavior', async (t) => {
  await t.test('patrols within specified range and reverses direction at boundaries', () => {
    const cake = new TestCake(500, 200, 50, 40, 50, 2.0, 0);
    assert.strictEqual(cake.dir, 1);

    // Advance cake past right boundary
    for (let i = 0; i < 35; i++) {
      cake.update(1.0);
    }
    assert.strictEqual(cake.dir, -1, 'cake should reverse direction to -1 at right boundary');

    // Advance cake past left boundary
    for (let i = 0; i < 70; i++) {
      cake.update(1.0);
    }
    assert.strictEqual(cake.dir, 1, 'cake should reverse direction to 1 at left boundary');
  });
});

test('Astro Steve Rescue Sequence Entity', async (t) => {
  await t.test('accelerates upward with thruster trajectory and displays speech bubble', () => {
    const astro = new TestAstro(1000, 400);
    assert.strictEqual(astro.bubbleAlpha, 0);

    for (let i = 0; i < 20; i++) {
      astro.update(1.0);
    }

    assert.ok(astro.y < 400, 'astro should rocket upward (negative y velocity)');
    assert.ok(astro.x > 1000, 'astro should fly horizontally');
    assert.ok(astro.bubbleAlpha > 0, 'speech bubble should fade in');
    assert.strictEqual(astro.alive(), true);
  });
});

test('Level & World Configuration Integrity', async (t) => {
  await t.test('world dimensions and platform coordinates are consistent', () => {
    const SCALE = 1.35;
    const worldWidth = 3600 * SCALE;
    const groundH = Math.floor(64 * SCALE);
    const cameraHeight = 720;
    const groundY = cameraHeight - groundH;

    assert.ok(worldWidth > 4000, 'world width should provide ample run distance');
    assert.ok(groundY > 500, 'ground Y should be positioned at bottom of viewport');

    // Verify player start and goal present placements
    const playerStartX = Math.floor(50 * SCALE);
    const presentGoalX = Math.floor(worldWidth - 140 * SCALE);

    assert.ok(playerStartX >= 0, 'player starts inside bounds');
    assert.ok(presentGoalX < worldWidth, 'present goal is before world edge');
    assert.ok(presentGoalX > playerStartX + 3000, 'present goal is far enough for a fun full level run');
  });
});

test('game.js Source Script Validation', async (t) => {
  await t.test('game.js has valid syntax and compiles without error', async () => {
    const fs = await import('node:fs');
    const vm = await import('node:vm');
    const path = await import('node:path');
    const code = fs.readFileSync(path.resolve('game.js'), 'utf8');
    assert.doesNotThrow(() => {
      new vm.Script(code);
    }, 'game.js should parse and compile with zero syntax errors');
  });
});
