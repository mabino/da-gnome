// Da Gnome Pal on Mars — 2026 High-Fidelity Canvas Sidescroller
// Modern procedural rendering, 2D dynamic lighting, multi-layer parallax, particle physics, and chiptune synth.

(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // DOM elements
  const deathsEl = document.getElementById('deaths');
  const livesEl = document.getElementById('lives');
  const progressFill = document.getElementById('progress-bar-fill');
  const progressGnomePin = document.getElementById('progress-gnome-pin');
  const progressDist = document.getElementById('progress-dist');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const overlayBadge = document.getElementById('overlay-badge');
  const restartBtn = document.getElementById('restart');
  const splash = document.getElementById('splash');
  const playBtn = document.getElementById('play-btn');
  const audioToggle = document.getElementById('audio-toggle');
  const statTime = document.getElementById('stat-time');
  const statJumps = document.getElementById('stat-jumps');
  const statDeaths = document.getElementById('stat-deaths');

  // Viewport & High-DPI Camera setup
  const camera = { x: 0, y: 0, width: 1280, height: 720, targetX: 0, lookAhead: 0 };
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const targetW = rect.width || 960;
    const targetH = rect.height || 540;

    canvas.width = Math.round(targetW * dpr);
    canvas.height = Math.round(targetH * dpr);

    camera.width = canvas.width / dpr;
    camera.height = canvas.height / dpr;
  }

  window.addEventListener('resize', resize);
  resize();

  // Physics & Gameplay Tuning
  const GRAV = 0.85;
  const FRICTION = 0.84;
  const MOVE_ACCEL = 1.15;
  const MAX_SPEED = 7.5;
  const JUMP_SPEED = 16.2;
  const DOUBLE_JUMP_MULT = 0.82;
  const SCALE = 1.35;

  let worldWidth = 3600 * SCALE;
  let deaths = 0;
  let lives = 3;
  let totalJumps = 0;
  let missionStartTime = 0;
  let gameOver = false;
  let gameWon = false;
  let gameStarted = false;
  let rafId = null;

  // Cinematic FX state
  let timeScale = 1.0;
  let timeScaleTarget = 1.0;
  let cameraShake = 0;
  let cameraShakeX = 0;
  let cameraShakeY = 0;
  let flashAlpha = 0;

  // Sequences
  let presentSequence = null;
  let resetPause = null;
  let endScreenStarted = false;
  let endScreenTimer = 0;
  let starfieldActive = false;
  let starfieldAlpha = 0;
  let starfieldStars = [];
  let starfieldSpawnTimer = 0;
  let starfieldLoopStarted = false;

  // Input State
  const keys = { left: false, right: false, up: false, restart: false };

  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
    if (e.code === 'KeyR') {
      if (gameOver || gameWon) {
        createLevel();
        startGame();
      }
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
  });

  // HUD update helper
  function updateHUD() {
    if (livesEl) {
      livesEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const pod = document.createElement('div');
        pod.className = 'life-pod' + (i >= lives ? ' lost' : '');
        livesEl.appendChild(pod);
      }
    }
    if (deathsEl) deathsEl.textContent = deaths;

    if (player && progressFill && progressGnomePin && progressDist) {
      const pct = Math.min(100, Math.max(0, Math.round((player.x / (worldWidth - 200 * SCALE)) * 100)));
      progressFill.style.width = pct + '%';
      progressGnomePin.style.left = pct + '%';
      progressDist.textContent = pct + '%';
    }
  }

  // AABB helper
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // =========================================================================
  // 2D Dynamic Lighting Engine
  // =========================================================================
  class LightingEngine {
    constructor() {
      this.lights = [];
    }
    clear() {
      this.lights.length = 0;
    }
    addLight(x, y, radius, color, intensity = 1.0) {
      this.lights.push({ x, y, radius, color, intensity });
    }
    render(ctx, camera) {
      if (this.lights.length === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const l of this.lights) {
        const sx = l.x - camera.x;
        const sy = l.y - camera.y;
        if (sx + l.radius < -100 || sx - l.radius > camera.width + 100 || sy + l.radius < -100 || sy - l.radius > camera.height + 100) continue;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, l.radius);
        grad.addColorStop(0, l.color);
        grad.addColorStop(0.4, l.color.replace(/[\d\.]+\)$/, (parseFloat(l.color.match(/[\d\.]+\)$/)?.[0] || 1) * 0.4 + ')'));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, l.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const lighting = new LightingEngine();

  // =========================================================================
  // Particle & Visual FX System
  // =========================================================================
  class Particle {
    constructor(x, y, vx, vy, color, size = 4, ttl = 45, type = 'square') {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.size = size;
      this.maxSize = size;
      this.ttl = ttl;
      this.age = 0;
      this.type = type; // 'square', 'circle', 'spark', 'shockwave', 'confetti', 'smoke'
      this.rot = Math.random() * Math.PI * 2;
      this.vRot = (Math.random() - 0.5) * 0.25;
      this.gravity = 0.12;
      this.drag = 0.985;
    }

    update() {
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += this.gravity * timeScale;
      this.vx *= Math.pow(this.drag, timeScale);
      this.rot += this.vRot * timeScale;
      this.age += 1 * timeScale;
    }

    draw(ctx, camX, camY) {
      const progress = this.age / this.ttl;
      const alpha = Math.max(0, 1 - progress);
      const px = this.x - camX;
      const py = this.y - camY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(px, py);
      ctx.rotate(this.rot);

      if (this.type === 'shockwave') {
        const curR = this.size * (progress * 2.5 + 0.5);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1, 4 * (1 - progress));
        ctx.beginPath();
        ctx.arc(0, 0, curR, 0, Math.PI * 2);
        ctx.stroke();
      } else if (this.type === 'confetti') {
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size, -this.size / 2, this.size * 2, this.size);
      } else if (this.type === 'smoke') {
        const curR = this.size * (1 + progress * 1.8);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, curR, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'circle' || this.type === 'spark') {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, this.size * (1 - progress * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = this.color;
        const curSize = Math.max(1, this.size * (1 - progress * 0.3));
        ctx.fillRect(-curSize / 2, -curSize / 2, curSize, curSize);
      }
      ctx.restore();
    }

    alive() {
      return this.age < this.ttl;
    }
  }

  // =========================================================================
  // Celestial & Multi-Layer Parallax Environment
  // =========================================================================
  class ParallaxEnvironment {
    constructor() {
      this.stars = [];
      this.ambientDust = [];
      this.shootingStars = [];
      this.shootingStarTimer = 80;
      this.init();
    }

    init() {
      // 120+ twinkling background stars
      this.stars.length = 0;
      for (let i = 0; i < 140; i++) {
        this.stars.push({
          x: Math.random() * 2400,
          y: Math.random() * 500,
          size: Math.random() * 2.2 + 0.6,
          twinkleSpeed: Math.random() * 0.04 + 0.015,
          color: ['#ffffff', '#ffe4d6', '#ffd2a6', '#c8e2ff', '#ffbfa8'][Math.floor(Math.random() * 5)],
          baseAlpha: Math.random() * 0.7 + 0.3
        });
      }

      // Ambient Mars dust motes floating across screen
      this.ambientDust.length = 0;
      for (let i = 0; i < 60; i++) {
        this.ambientDust.push({
          x: Math.random() * 1600,
          y: Math.random() * 700,
          vx: (Math.random() * 0.8 + 0.3) * (Math.random() > 0.3 ? -1 : 1),
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2.5 + 1,
          alpha: Math.random() * 0.4 + 0.15,
          color: Math.random() > 0.4 ? '#ff9966' : '#ffd4a3'
        });
      }
    }

    update(camX) {
      // Update ambient dust
      for (const d of this.ambientDust) {
        d.x += d.vx * timeScale;
        d.y += d.vy * timeScale;
        if (d.x < -50) d.x = camera.width + 50;
        if (d.x > camera.width + 50) d.x = -50;
        if (d.y < 0) d.y = camera.height;
        if (d.y > camera.height) d.y = 0;
      }

      // Shooting stars
      this.shootingStarTimer -= 1 * timeScale;
      if (this.shootingStarTimer <= 0) {
        this.shootingStars.push({
          x: Math.random() * (camera.width + 200),
          y: Math.random() * (camera.height * 0.35),
          vx: -(Math.random() * 12 + 10),
          vy: Math.random() * 4 + 3,
          len: Math.random() * 80 + 50,
          alpha: 1.0,
          decay: Math.random() * 0.03 + 0.02
        });
        this.shootingStarTimer = Math.floor(Math.random() * 180 + 120);
      }

      for (let i = this.shootingStars.length - 1; i >= 0; i--) {
        const ss = this.shootingStars[i];
        ss.x += ss.vx * timeScale;
        ss.y += ss.vy * timeScale;
        ss.alpha -= ss.decay * timeScale;
        if (ss.alpha <= 0) this.shootingStars.splice(i, 1);
      }
    }

    drawSkyAndCelestial(ctx, camX, camY) {
      const w = camera.width;
      const h = camera.height;

      // 1. Rich Mars Dusk Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0.0, '#100511'); // deep cosmic space
      skyGrad.addColorStop(0.25, '#2b0c16'); // upper ionosphere
      skyGrad.addColorStop(0.55, '#5c191a'); // mid atmosphere
      skyGrad.addColorStop(0.85, '#a33c2a'); // lower dust haze
      skyGrad.addColorStop(1.0, '#de6e3b'); // horizon amber
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Cosmic Nebulae
      ctx.save();
      const nebGrad1 = ctx.createRadialGradient(w * 0.25, h * 0.2, 10, w * 0.25, h * 0.2, w * 0.45);
      nebGrad1.addColorStop(0, 'rgba(180, 50, 110, 0.18)');
      nebGrad1.addColorStop(0.6, 'rgba(120, 20, 80, 0.06)');
      nebGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebGrad1;
      ctx.fillRect(0, 0, w, h);

      const nebGrad2 = ctx.createRadialGradient(w * 0.75, h * 0.35, 10, w * 0.75, h * 0.35, w * 0.4);
      nebGrad2.addColorStop(0, 'rgba(255, 120, 50, 0.15)');
      nebGrad2.addColorStop(0.7, 'rgba(180, 60, 20, 0.04)');
      nebGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebGrad2;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 3. Twinkling Stars (Parallax 0.02)
      ctx.save();
      const now = Date.now() * 0.003;
      for (const s of this.stars) {
        const sx = ((s.x - camX * 0.02) % (w + 200) + (w + 200)) % (w + 200) - 100;
        const sy = s.y;
        const tw = s.baseAlpha * (0.6 + Math.sin(now + s.x * 0.05) * 0.4);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 4. Distant Celestial Bodies: Phobos, Deimos, Earth, Sun
      // Sun (Distant bright star on Mars horizon)
      ctx.save();
      const sunX = w * 0.82 - camX * 0.015;
      const sunY = h * 0.38;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 140);
      sunGlow.addColorStop(0, '#ffffff');
      sunGlow.addColorStop(0.15, 'rgba(255, 235, 180, 0.85)');
      sunGlow.addColorStop(0.4, 'rgba(255, 160, 80, 0.35)');
      sunGlow.addColorStop(1, 'rgba(255, 100, 40, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 140, 0, Math.PI * 2);
      ctx.fill();

      // Horizontal lens flare streak
      ctx.fillStyle = 'rgba(255, 220, 160, 0.25)';
      ctx.fillRect(sunX - 160, sunY - 1.5, 320, 3);
      ctx.restore();

      // Phobos (Large potato moon)
      ctx.save();
      const phobosX = w * 0.22 - camX * 0.03;
      const phobosY = h * 0.22;
      const phobosR = 26;
      // Moon sphere shading
      const pGrad = ctx.createRadialGradient(phobosX - 8, phobosY - 8, 4, phobosX, phobosY, phobosR);
      pGrad.addColorStop(0, '#e8d5c4');
      pGrad.addColorStop(0.5, '#a48a78');
      pGrad.addColorStop(0.85, '#543e34');
      pGrad.addColorStop(1, '#2a1a14');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(phobosX, phobosY, phobosR, 0, Math.PI * 2);
      ctx.fill();

      // Phobos crater details
      ctx.fillStyle = 'rgba(30, 18, 12, 0.45)';
      ctx.beginPath();
      ctx.arc(phobosX - 6, phobosY - 4, 7, 0, Math.PI * 2);
      ctx.arc(phobosX + 10, phobosY + 5, 5, 0, Math.PI * 2);
      ctx.arc(phobosX - 2, phobosY + 12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Earth & Moon ("Pale Blue Dot")
      ctx.save();
      const earthX = w * 0.52 - camX * 0.02;
      const earthY = h * 0.16;
      ctx.fillStyle = '#6ee2ff';
      ctx.shadowColor = '#00c3ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(earthX, earthY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // tiny moon dot next to earth
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(earthX + 8, earthY - 3, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Shooting stars
      ctx.save();
      for (const ss of this.shootingStars) {
        ctx.strokeStyle = `rgba(255, 235, 200, ${ss.alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - ss.vx * (ss.len / 20), ss.y - ss.vy * (ss.len / 20));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawParallaxLayers(ctx, camX, groundY) {
      const w = camera.width;
      const h = camera.height;

      // Layer 1: Extreme Distance Mountains (Olympus Mons) - Parallax 0.10
      ctx.save();
      ctx.translate(-camX * 0.10, 0);
      const l1BaseY = groundY + 40;
      ctx.fillStyle = '#4a1518';
      ctx.beginPath();
      ctx.moveTo(-200, l1BaseY);
      for (let x = -200; x <= worldWidth + 400; x += 320) {
        const peakH = 140 + Math.sin(x * 0.003) * 60 + Math.cos(x * 0.007) * 40;
        ctx.lineTo(x + 160, l1BaseY - peakH);
        ctx.lineTo(x + 320, l1BaseY);
      }
      ctx.closePath();
      ctx.fill();

      // Mountain rim highlight from setting sun
      ctx.strokeStyle = 'rgba(255, 140, 90, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Layer 2: Mid Distance Martian Canyon Mesas & Spires - Parallax 0.28
      ctx.save();
      ctx.translate(-camX * 0.28, 0);
      const l2BaseY = groundY + 20;
      ctx.fillStyle = '#7a2422';
      ctx.beginPath();
      ctx.moveTo(-200, l2BaseY);
      for (let x = -200; x <= worldWidth + 400; x += 220) {
        const mesaH = 90 + Math.sin(x * 0.006) * 45;
        // stepped canyon mesa shape
        ctx.lineTo(x + 40, l2BaseY - mesaH * 0.7);
        ctx.lineTo(x + 80, l2BaseY - mesaH);
        ctx.lineTo(x + 160, l2BaseY - mesaH);
        ctx.lineTo(x + 190, l2BaseY - mesaH * 0.6);
        ctx.lineTo(x + 220, l2BaseY);
      }
      ctx.closePath();
      ctx.fill();

      // Canyon rim lighting
      ctx.strokeStyle = 'rgba(255, 170, 110, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Layer 3: Sci-Fi Mars Colony Outpost Silhouettes & Domes - Parallax 0.50
      ctx.save();
      ctx.translate(-camX * 0.50, 0);
      const l3BaseY = groundY;
      ctx.fillStyle = '#9e352b';

      for (let x = 100; x < worldWidth + 400; x += 550) {
        // Habitat Dome
        ctx.beginPath();
        ctx.arc(x + 120, l3BaseY, 44, Math.PI, 0);
        ctx.fill();

        // Dome illuminated windows
        ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
        for (let w = -24; w <= 24; w += 16) {
          ctx.fillRect(x + 120 + w - 4, l3BaseY - 24, 8, 5);
        }
        ctx.fillStyle = '#9e352b';

        // Solar Array
        ctx.fillRect(x + 220, l3BaseY - 32, 50, 6);
        ctx.fillRect(x + 242, l3BaseY - 32, 6, 32);

        // Comm Tower with pulsing red beacon
        ctx.fillRect(x + 320, l3BaseY - 75, 4, 75);
        ctx.fillRect(x + 314, l3BaseY - 60, 16, 3);
        ctx.fillRect(x + 316, l3BaseY - 45, 12, 3);

        // Blinking tower warning light
        const blink = Math.sin(Date.now() * 0.006 + x) > 0 ? 1 : 0.15;
        ctx.fillStyle = `rgba(255, 40, 40, ${blink})`;
        ctx.beginPath();
        ctx.arc(x + 322, l3BaseY - 77, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9e352b';
      }
      ctx.restore();
    }

    drawAtmosphericFog(ctx, groundY) {
      // Warm Martian horizon fog
      const fogTop = groundY - 110;
      const fogGrad = ctx.createLinearGradient(0, fogTop, 0, groundY + 40);
      fogGrad.addColorStop(0, 'rgba(255, 140, 80, 0.0)');
      fogGrad.addColorStop(0.4, 'rgba(240, 110, 60, 0.14)');
      fogGrad.addColorStop(1, 'rgba(140, 40, 30, 0.45)');
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, fogTop, camera.width, camera.height - fogTop);

      // Render floating ambient dust motes
      ctx.save();
      for (const d of this.ambientDust) {
        ctx.fillStyle = d.color;
        ctx.globalAlpha = d.alpha;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Screen Vignette
      const vigGrad = ctx.createRadialGradient(camera.width / 2, camera.height / 2, camera.height * 0.4, camera.width / 2, camera.height / 2, camera.width * 0.7);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(0.8, 'rgba(15,3,3,0.25)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, camera.width, camera.height);
    }
  }

  const env = new ParallaxEnvironment();

  // =========================================================================
  // Platforms & Martian Regolith Ground
  // =========================================================================
  class Platform {
    constructor(x, y, w, h, isGround = false) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.isGround = isGround;
      this.hoverPhase = Math.random() * Math.PI * 2;
      this.crystals = [];
      if (isGround) {
        // Generate underground glowing crystals
        for (let cx = 160; cx < w; cx += 280 + Math.random() * 200) {
          this.crystals.push({
            x: cx,
            y: y + 22 + Math.random() * 26,
            color: ['#00e5ff', '#ff0055', '#ffbb00', '#00ffaa'][Math.floor(Math.random() * 4)],
            size: 6 + Math.random() * 6
          });
        }
      }
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;
      if (px + this.w < -100 || px > camera.width + 100) return;

      if (this.isGround) {
        // Ground Regolith Rendering
        ctx.save();
        // Bedrock Base
        const gGrad = ctx.createLinearGradient(0, py, 0, py + this.h);
        gGrad.addColorStop(0, '#c24b38'); // Top regolith
        gGrad.addColorStop(0.2, '#943024'); // Mid strata
        gGrad.addColorStop(0.6, '#5e1b15'); // Deep basalt
        gGrad.addColorStop(1.0, '#300b08'); // Subterranean mantle
        ctx.fillStyle = gGrad;
        ctx.fillRect(px, py, this.w, this.h);

        // Top regolith textured highlight trim
        ctx.fillStyle = '#ff8266';
        ctx.fillRect(px, py, this.w, 4);
        ctx.fillStyle = '#e65e43';
        ctx.fillRect(px, py + 4, this.w, 6);

        // Strata sediment lines
        ctx.strokeStyle = 'rgba(60, 15, 10, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py + 22);
        ctx.lineTo(px + this.w, py + 22);
        ctx.moveTo(px, py + 42);
        ctx.lineTo(px + this.w, py + 42);
        ctx.stroke();

        // Glowing subterranean crystal geodes
        for (const cry of this.crystals) {
          const cx = cry.x - camX;
          const cy = cry.y - camY;
          if (cx < -40 || cx > camera.width + 40) continue;
          ctx.save();
          ctx.fillStyle = cry.color;
          ctx.shadowColor = cry.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(cx, cy - cry.size);
          ctx.lineTo(cx + cry.size * 0.7, cy);
          ctx.lineTo(cx, cy + cry.size);
          ctx.lineTo(cx - cry.size * 0.7, cy);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Add dynamic light
          lighting.addLight(cry.x, cry.y, 45, cry.color.replace('#', 'rgba(') === cry.color ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 100, 50, 0.4)');
        }
        ctx.restore();
      } else {
        // High-Tech Sci-Fi Antigravity Floating Platform
        ctx.save();
        this.hoverPhase += 0.04;
        const bob = Math.sin(this.hoverPhase) * 2;
        const curY = py + bob;

        // Drop shadow onto environment
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(px + 4, curY + this.h + 12, this.w - 8, 10);

        // Main Metallic Chassis
        const platGrad = ctx.createLinearGradient(0, curY, 0, curY + this.h);
        platGrad.addColorStop(0, '#3a1f1d');
        platGrad.addColorStop(0.5, '#241212');
        platGrad.addColorStop(1, '#150808');
        ctx.fillStyle = platGrad;
        ctx.beginPath();
        ctx.roundRect(px, curY, this.w, this.h, 6);
        ctx.fill();

        // Glowing Neon Edge Trim (Cyan / Amber)
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8;
        ctx.fillRect(px + 4, curY, this.w - 8, 3);
        ctx.shadowBlur = 0;

        // Martian Sand Top Layer
        ctx.fillStyle = '#c7533e';
        ctx.fillRect(px + 6, curY + 3, this.w - 12, 3);

        // Underside Antigravity Repulsor Thruster Pods
        const podCount = Math.max(2, Math.floor(this.w / 60));
        for (let i = 0; i < podCount; i++) {
          const podX = px + 16 + i * ((this.w - 32) / (podCount - 1));
          const podY = curY + this.h;

          // Pod housing
          ctx.fillStyle = '#444';
          ctx.fillRect(podX - 6, podY - 2, 12, 5);

          // Plasma Repulsor Flame
          const flameH = 10 + Math.sin(this.hoverPhase * 3 + i) * 5;
          const flameGrad = ctx.createLinearGradient(0, podY, 0, podY + flameH);
          flameGrad.addColorStop(0, '#00e5ff');
          flameGrad.addColorStop(0.6, 'rgba(0, 150, 255, 0.6)');
          flameGrad.addColorStop(1, 'rgba(0, 50, 255, 0)');
          ctx.fillStyle = flameGrad;
          ctx.beginPath();
          ctx.moveTo(podX - 5, podY + 3);
          ctx.lineTo(podX + 5, podY + 3);
          ctx.lineTo(podX, podY + 3 + flameH);
          ctx.closePath();
          ctx.fill();

          // Dynamic light under thruster
          lighting.addLight(this.x + 16 + i * ((this.w - 32) / (podCount - 1)), this.y + this.h + 10 + bob, 50, 'rgba(0, 229, 255, 0.45)');
        }
        ctx.restore();
      }
    }
  }

  // =========================================================================
  // Da Gnome Pal (Hero Character)
  // =========================================================================
  class Player {
    constructor(x, y) {
      this.startX = x;
      this.startY = y;
      this.reset();
    }

    reset() {
      this.x = this.startX;
      this.y = this.startY;
      this.w = Math.floor(44 * SCALE);
      this.h = Math.floor(62 * SCALE);
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.jumpCount = 0;
      this._upHeld = false;

      // Animation variables
      this.facing = 1;
      this.animTime = 0;
      this.squash = 1.0;
      this.stretch = 1.0;
      this.hatAngle = 0;
      this.blinkTimer = 120;
      this.isBlinking = false;
      this.flipRotation = 0;
      this.isFlipping = false;
    }

    update(platforms, effects) {
      // Horizontal input & acceleration
      if (keys.left) {
        this.vx -= MOVE_ACCEL;
        this.facing = -1;
      }
      if (keys.right) {
        this.vx += MOVE_ACCEL;
        this.facing = 1;
      }

      // Cap horizontal speed and apply friction
      this.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.vx));
      this.vx *= FRICTION;
      this.vy += GRAV;

      // Jump handling
      if (keys.up && !this._upHeld) {
        if (this.onGround) {
          // Normal ground jump
          this.vy = -JUMP_SPEED;
          this.onGround = false;
          this.jumpCount = 0;
          this.squash = 0.75;
          this.stretch = 1.35;
          totalJumps++;

          // Jump launch particle burst
          for (let i = 0; i < 8; i++) {
            effects.push(new Particle(this.x + this.w / 2 + (Math.random() - 0.5) * 16, this.y + this.h, (Math.random() - 0.5) * 4, Math.random() * 2 + 1, '#ff9966', 4, 25, 'spark'));
          }
          if (window.__gameAudio?.playJump) window.__gameAudio.playJump();
        } else if (this.jumpCount < 1) {
          // High-tech Double-Jump with Thruster Somersault!
          this.vy = -Math.abs(JUMP_SPEED * DOUBLE_JUMP_MULT);
          this.jumpCount += 1;
          this.isFlipping = true;
          this.flipRotation = 0;
          totalJumps++;
          cameraShake = Math.max(cameraShake, 6);

          // Shockwave ring + cyan thruster blast
          effects.push(new Particle(this.x + this.w / 2, this.y + this.h - 10, 0, 0, '#00e5ff', 30, 20, 'shockwave'));
          for (let i = 0; i < 14; i++) {
            effects.push(new Particle(this.x + this.w / 2, this.y + this.h - 10, (Math.random() - 0.5) * 6, Math.random() * 4 + 2, ['#00e5ff', '#70f0ff', '#ffffff'][Math.floor(Math.random() * 3)], 5, 30, 'spark'));
          }
          if (window.__gameAudio?.playDoubleJump) window.__gameAudio.playDoubleJump();
        }
        this._upHeld = true;
      }
      if (!keys.up) this._upHeld = false;

      // Apply motion
      this.x += this.vx;
      this.y += this.vy;

      // World boundaries
      if (this.x < 0) { this.x = 0; this.vx = 0; }
      if (this.x + this.w > worldWidth) { this.x = worldWidth - this.w; this.vx = 0; }

      // Platform Collisions (One-way top collision)
      const prevOnGround = this.onGround;
      this.onGround = false;
      for (const p of platforms) {
        if (this.x + this.w > p.x && this.x < p.x + p.w) {
          const prevY = this.y - this.vy;
          if (prevY + this.h <= p.y + 4 && this.y + this.h >= p.y && this.vy >= 0) {
            this.y = p.y - this.h;
            this.vy = 0;
            this.onGround = true;

            // Landing squash and footstep dust
            if (!prevOnGround) {
              this.squash = 1.3;
              this.stretch = 0.75;
              this.isFlipping = false;
              for (let i = 0; i < 6; i++) {
                effects.push(new Particle(this.x + this.w / 2, this.y + this.h, (Math.random() - 0.5) * 5, -Math.random() * 2, '#ff8855', 3.5, 20, 'circle'));
              }
            }
          }
        }
      }

      if (this.onGround) this.jumpCount = 0;

      // Running animation & footstep particles
      if (this.onGround && Math.abs(this.vx) > 0.5) {
        this.animTime += 0.28 * (Math.abs(this.vx) / MAX_SPEED);
        if (Math.random() < 0.35) {
          effects.push(new Particle(this.x + (this.facing > 0 ? 6 : this.w - 6), this.y + this.h - 2, -this.facing * (Math.random() * 2 + 1), -Math.random() * 1.5, '#ff7744', 3, 18, 'circle'));
        }
      } else if (this.onGround) {
        this.animTime *= 0.8;
      }

      // Dynamic Hat physics & Eye Blinking
      this.hatAngle += (-this.vx * 0.04 - this.hatAngle) * 0.15;
      this.squash += (1.0 - this.squash) * 0.15;
      this.stretch += (1.0 - this.stretch) * 0.15;

      if (this.isFlipping) {
        this.flipRotation += this.facing * 0.45;
        if (Math.abs(this.flipRotation) >= Math.PI * 2) {
          this.isFlipping = false;
          this.flipRotation = 0;
        }
      }

      this.blinkTimer -= 1;
      if (this.blinkTimer <= 0) {
        this.isBlinking = !this.isBlinking;
        this.blinkTimer = this.isBlinking ? 8 : Math.floor(Math.random() * 160 + 80);
      }

      // Add character light
      lighting.addLight(this.x + this.w / 2, this.y + this.h / 2, 90, 'rgba(255, 180, 100, 0.3)');
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      const s = SCALE;

      ctx.save();
      ctx.translate(px, py);

      // Somersault rotation if mid-air flipping
      if (this.isFlipping) {
        ctx.translate(0, -this.h / 2);
        ctx.rotate(this.flipRotation);
        ctx.translate(0, this.h / 2);
      }

      ctx.scale(this.facing * this.squash, this.stretch);

      // Drop shadow underneath player
      if (this.onGround) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 * s, 5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Running walk cycle phase
      const legPhase = this.animTime;
      const legSpread = this.onGround ? Math.sin(legPhase) * 9 * s : 4 * s;
      const legLift = this.onGround ? Math.max(0, -Math.sin(legPhase)) * 6 * s : 0;

      // 1. Boots & Thrusters
      // Left Boot (Back)
      ctx.fillStyle = '#422216';
      ctx.fillRect(-12 * s - legSpread, -12 * s + legLift, 10 * s, 12 * s);
      ctx.fillStyle = '#200e08'; // Sole
      ctx.fillRect(-14 * s - legSpread, -3 * s + legLift, 12 * s, 3 * s);

      // Right Boot (Front)
      ctx.fillStyle = '#542d1e';
      ctx.fillRect(2 * s + legSpread, -12 * s - legLift, 10 * s, 12 * s);
      ctx.fillStyle = '#200e08';
      ctx.fillRect(0 * s + legSpread, -3 * s - legLift, 12 * s, 3 * s);

      // Mini Rocket Heel Thruster Glow
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 6;
      ctx.fillRect(-12 * s - legSpread, -5 * s + legLift, 3 * s, 2 * s);
      ctx.fillRect(2 * s + legSpread, -5 * s - legLift, 3 * s, 2 * s);
      ctx.shadowBlur = 0;

      // 2. Oxygen Backpack Tank
      ctx.fillStyle = '#8a9ba8';
      ctx.beginPath();
      ctx.roundRect(-18 * s, -38 * s, 9 * s, 22 * s, 3 * s);
      ctx.fill();
      // Glowing pressure indicator
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(-16 * s, -34 * s, 5 * s, 3 * s);

      // 3. Cyber-Tunic & Torso
      ctx.fillStyle = '#1a5499';
      ctx.beginPath();
      ctx.ellipse(0, -24 * s, 16 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Belt & Golden Brass Buckle
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(-14 * s, -18 * s, 28 * s, 5 * s);
      ctx.fillStyle = '#ffd043';
      ctx.fillRect(-4 * s, -19 * s, 8 * s, 7 * s);

      // 4. Head & Nano-Helmet Visor
      ctx.fillStyle = '#ffd4b2'; // Face skin
      ctx.beginPath();
      ctx.arc(0, -36 * s, 12 * s, 0, Math.PI * 2);
      ctx.fill();

      // Fluffy White Beard (Layered & Bouncing)
      const beardBounce = Math.sin(this.animTime * 2) * 2 * s;
      ctx.fillStyle = '#f8f4eb';
      ctx.beginPath();
      ctx.moveTo(-13 * s, -32 * s);
      ctx.quadraticCurveTo(-14 * s, -14 * s + beardBounce, 0, -10 * s + beardBounce);
      ctx.quadraticCurveTo(14 * s, -14 * s + beardBounce, 13 * s, -32 * s);
      ctx.closePath();
      ctx.fill();

      // Beard Strata Shading
      ctx.strokeStyle = '#e0d8c8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cute 3D Button Nose
      ctx.fillStyle = '#ffb38a';
      ctx.beginPath();
      ctx.arc(3 * s, -34 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (Animated with Blinking & Tracking)
      if (!this.isBlinking) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(4 * s, -39 * s, 3 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupil looking forward
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(5.5 * s, -39 * s, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Closed eye blink slit
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(2 * s, -39 * s);
        ctx.lineTo(6 * s, -39 * s);
        ctx.stroke();
      }

      // 5. Tall Pointed Red Explorer Hat (Dynamic tip physics)
      ctx.save();
      ctx.translate(0, -42 * s);
      ctx.rotate(this.hatAngle);

      // Hat Cone
      ctx.fillStyle = '#e62e2e';
      ctx.beginPath();
      ctx.moveTo(-14 * s, 0);
      ctx.quadraticCurveTo(-6 * s, -28 * s, 4 * s, -40 * s); // pointed tip
      ctx.quadraticCurveTo(6 * s, -20 * s, 14 * s, 0);
      ctx.closePath();
      ctx.fill();

      // Hat Rim & Golden Star Emblem
      ctx.fillStyle = '#b81d1d';
      ctx.fillRect(-16 * s, -2 * s, 32 * s, 5 * s);
      ctx.fillStyle = '#ffd043';
      ctx.beginPath();
      ctx.arc(0, -1 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }
  }

  // =========================================================================
  // Murderous Cosmic Cakes (Monster Enemies)
  // =========================================================================
  class Cake {
    constructor(x, y, w, h, range, speed, type = 0) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.baseX = x;
      this.range = range;
      this.speed = speed;
      this.dir = 1;
      this.type = type; // 0: Strawberry Terror, 1: Dark Chocolate Doom, 2: Cyber Lime
      this.phase = Math.random() * Math.PI * 2;
    }

    update(effects) {
      if (gameOver) return;
      this.x += this.speed * this.dir * timeScale;
      if (this.x > this.baseX + this.range) this.dir = -1;
      if (this.x < this.baseX - this.range) this.dir = 1;
      this.phase += 0.09 * (0.8 + Math.abs(this.speed) * 0.2) * timeScale;

      // Emitted crumb particles
      if (Math.random() < 0.15) {
        const crumbCol = this.type === 1 ? '#ff5522' : '#ff3388';
        effects.push(new Particle(this.x + Math.random() * this.w, this.y + this.h - 4, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, crumbCol, 3, 20, 'circle'));
      }

      // Dynamic light from candles & menacing mouth
      lighting.addLight(this.x + this.w / 2, this.y - 12, 70, 'rgba(255, 180, 40, 0.45)');
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;
      if (px + this.w < -100 || px > camera.width + 100) return;

      ctx.save();
      ctx.translate(px, py);

      // Hover bob
      const bob = Math.sin(this.phase * 1.5) * 3;
      ctx.translate(0, bob);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(this.w / 2, this.h + 8 - bob, this.w * 0.55, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 1. Layered Sponge Cake Body
      const spongeCol = this.type === 1 ? '#3d1b14' : (this.type === 2 ? '#2b4d24' : '#ff9ebb');
      const jamCol = this.type === 1 ? '#ff4400' : (this.type === 2 ? '#00ffcc' : '#990044');
      ctx.fillStyle = spongeCol;
      ctx.beginPath();
      ctx.roundRect(0, 0, this.w, this.h, 6);
      ctx.fill();

      // Middle Oozing Alien Jam Layer
      ctx.fillStyle = jamCol;
      ctx.fillRect(0, this.h * 0.45, this.w, 5);

      // 2. Swirled Whipped Frosting & Dripping Icing
      ctx.fillStyle = this.type === 1 ? '#613323' : (this.type === 2 ? '#88ff44' : '#ffffff');
      ctx.beginPath();
      ctx.roundRect(-2, -8, this.w + 4, 12, 4);
      ctx.fill();

      // Dripping icing spikes
      for (let dx = 4; dx < this.w; dx += 12) {
        ctx.beginPath();
        ctx.moveTo(dx, 4);
        ctx.lineTo(dx + 5, 4);
        ctx.lineTo(dx + 2.5, 10 + Math.sin(dx + this.phase) * 3);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Menacing Chomping Maw & Razor Fangs
      const mouthOpen = 8 + Math.sin(this.phase) * 7;
      const mx = this.w * 0.12;
      const mw = this.w * 0.76;
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(mx, 4, mw, mouthOpen);

      // Razor Fangs (Top & Bottom)
      ctx.fillStyle = '#fff4cc';
      const teethCount = Math.max(3, Math.floor(mw / 10));
      const tw = mw / teethCount;
      for (let i = 0; i < teethCount; i++) {
        // Top fang
        ctx.beginPath();
        ctx.moveTo(mx + i * tw, 4);
        ctx.lineTo(mx + (i + 1) * tw, 4);
        ctx.lineTo(mx + (i + 0.5) * tw, 4 + Math.min(mouthOpen * 0.7, 7));
        ctx.closePath();
        ctx.fill();
      }

      // 4. Glowing Menacing Eyes
      const eyeCol = this.type === 1 ? '#ff2200' : '#ffee00';
      ctx.fillStyle = eyeCol;
      ctx.shadowColor = eyeCol;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.w * 0.28, -2, 4, 0, Math.PI * 2);
      ctx.arc(this.w * 0.72, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Slit Pupils looking at player
      ctx.fillStyle = '#000';
      ctx.fillRect(this.w * 0.28 - (this.dir > 0 ? 0 : 2), -4, 2, 5);
      ctx.fillRect(this.w * 0.72 - (this.dir > 0 ? 0 : 2), -4, 2, 5);

      // 5. Birthday Candles with Animated Radial Flames
      const ccount = Math.max(1, Math.floor(this.w / 28));
      for (let i = 0; i < ccount; i++) {
        const cx = 8 + i * ((this.w - 16) / Math.max(1, ccount - 1));
        // Wax body
        ctx.fillStyle = '#ffe082';
        ctx.fillRect(cx - 2.5, -22, 5, 14);
        ctx.fillStyle = '#ff8f00'; // Stripe
        ctx.fillRect(cx - 2.5, -17, 5, 3);

        // Flickering Tear-Drop Flame
        const flameFlicker = Math.sin(Date.now() * 0.015 + i) * 2;
        const flameH = 10 + flameFlicker;
        const flGrad = ctx.createRadialGradient(cx, -26, 1, cx, -26, flameH);
        flGrad.addColorStop(0, '#ffffff');
        flGrad.addColorStop(0.3, '#ffee55');
        flGrad.addColorStop(0.7, '#ff6600');
        flGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = flGrad;
        ctx.beginPath();
        ctx.ellipse(cx, -26, 4, flameH * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // =========================================================================
  // The Goal: Astro Steve's Present Pod
  // =========================================================================
  class Present {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = Math.floor(44 * SCALE);
      this.h = Math.floor(40 * SCALE);
      this.hoverPhase = 0;
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;
      if (px + this.w < -100 || px > camera.width + 100) return;

      this.hoverPhase += 0.05;
      const bob = Math.sin(this.hoverPhase) * 4;

      ctx.save();
      ctx.translate(px, py + bob);

      // Skyward Beacon Beam of Light
      const beamGrad = ctx.createLinearGradient(0, 0, 0, -500);
      beamGrad.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
      beamGrad.addColorStop(0.6, 'rgba(0, 150, 255, 0.15)');
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(this.w / 2 - 16, -500, 32, 500);

      // Holographic Gift Box Base
      const boxGrad = ctx.createLinearGradient(0, 0, this.w, this.h);
      boxGrad.addColorStop(0, '#00ffaa');
      boxGrad.addColorStop(0.5, '#00b4d8');
      boxGrad.addColorStop(1, '#7209b7');
      ctx.fillStyle = boxGrad;
      ctx.beginPath();
      ctx.roundRect(0, 0, this.w, this.h, 6);
      ctx.fill();

      // Glowing Neon Energy Ribbons
      ctx.fillStyle = '#ff007f';
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 10;
      ctx.fillRect(this.w / 2 - 5, 0, 10, this.h);
      ctx.fillRect(0, this.h / 2 - 5, this.w, 10);
      ctx.shadowBlur = 0;

      // Golden Bow
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(8, 4, 8, 0, Math.PI * 2);
      ctx.arc(this.w - 8, 4, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Present Dynamic Light
      lighting.addLight(this.x + this.w / 2, this.y + this.h / 2 + bob, 140, 'rgba(0, 229, 255, 0.6)');
    }
  }

  // =========================================================================
  // Astro Steve (Liberated Buddy Astronaut)
  // =========================================================================
  class Astro {
    constructor(x, y, bubbleText) {
      this.x = x;
      this.y = y;
      this.vx = 4.8 + Math.random() * 2.0;
      this.vy = -8.5 - Math.random() * 3.5;
      this.age = 0;
      this.ttl = 380;
      this.scale = 1.6;
      this.bubbleAlpha = 0;
      this.bubbleText = bubbleText || 'THANKS BUDDY! EARTH BOUND! 🚀';
      this.rot = 0;
    }

    update(effects) {
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += 0.05 * timeScale;
      this.vx *= 0.998;
      this.rot += 0.03 * timeScale;
      this.age += 1 * timeScale;

      if (this.bubbleAlpha < 1) this.bubbleAlpha = Math.min(1, this.bubbleAlpha + 0.06);

      // Rocket Thruster Smoke & Fire plume
      if (Math.random() < 0.7) {
        effects.push(new Particle(this.x - 4, this.y + 24, (Math.random() - 0.5) * 3, Math.random() * 3 + 2, '#ff6600', 5, 25, 'spark'));
        effects.push(new Particle(this.x - 4, this.y + 30, (Math.random() - 0.5) * 4, Math.random() * 2 + 1, 'rgba(200, 200, 200, 0.6)', 8, 35, 'smoke'));
      }

      lighting.addLight(this.x, this.y, 110, 'rgba(255, 120, 40, 0.6)');
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(this.scale, this.scale);

      // Speech Bubble
      if (this.bubbleAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = this.bubbleAlpha;
        ctx.fillStyle = 'rgba(20, 8, 8, 0.88)';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(24, -58, 220, 36, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.fillText(this.bubbleText, 34, -36);
        ctx.restore();
      }

      // Astronaut Body
      ctx.rotate(this.rot * 0.2);

      // Suit
      ctx.fillStyle = '#eeeeee';
      ctx.beginPath();
      ctx.roundRect(-10, 0, 20, 24, 6);
      ctx.fill();

      // Mission Patch
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(-6, 4, 5, 4);

      // Helmet & Golden Visor
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -12, 14, 0, Math.PI * 2);
      ctx.fill();

      // Golden Mirror Visor with reflection
      const visGrad = ctx.createLinearGradient(-8, -18, 8, -6);
      visGrad.addColorStop(0, '#ffe066');
      visGrad.addColorStop(0.5, '#ff9900');
      visGrad.addColorStop(1, '#cc5500');
      ctx.fillStyle = visGrad;
      ctx.beginPath();
      ctx.ellipse(0, -12, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Visor Glint
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -16, 3, 2);

      // Jetpack Thruster Flame
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(-6, 24);
      ctx.lineTo(6, 24);
      ctx.lineTo(0, 38 + Math.sin(Date.now() * 0.03) * 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    alive() {
      return this.age < this.ttl;
    }
  }

  // =========================================================================
  // Level Setup & Entities Manager
  // =========================================================================
  const platforms = [];
  const cakes = [];
  const effects = [];
  let player, present;

  function createLevel() {
    platforms.length = 0;
    cakes.length = 0;
    effects.length = 0;
    lighting.clear();
    presentSequence = null;
    resetPause = null;
    gameOver = false;
    gameWon = false;
    timeScale = 1.0;
    timeScaleTarget = 1.0;
    cameraShake = 0;
    flashAlpha = 0;

    const groundH = Math.floor(64 * SCALE);
    const groundY = camera.height - groundH;

    // Ground Platform across entire world
    platforms.push(new Platform(0, groundY, worldWidth, groundH, true));

    // High-Tech Antigravity Floating Platforms (Structured Level Design)
    platforms.push(new Platform(Math.floor(340 * SCALE), groundY - Math.floor(140 * SCALE), Math.floor(220 * SCALE), Math.floor(18 * SCALE)));
    platforms.push(new Platform(Math.floor(720 * SCALE), groundY - Math.floor(220 * SCALE), Math.floor(190 * SCALE), Math.floor(18 * SCALE)));
    platforms.push(new Platform(Math.floor(1120 * SCALE), groundY - Math.floor(160 * SCALE), Math.floor(240 * SCALE), Math.floor(18 * SCALE)));
    platforms.push(new Platform(Math.floor(1540 * SCALE), groundY - Math.floor(240 * SCALE), Math.floor(190 * SCALE), Math.floor(18 * SCALE)));
    platforms.push(new Platform(Math.floor(1960 * SCALE), groundY - Math.floor(180 * SCALE), Math.floor(230 * SCALE), Math.floor(18 * SCALE)));
    platforms.push(new Platform(Math.floor(2380 * SCALE), groundY - Math.floor(130 * SCALE), Math.floor(290 * SCALE), Math.floor(18 * SCALE)));

    // Cosmic Monster Cakes (Varied Types)
    cakes.push(new Cake(Math.floor(400 * SCALE), groundY - Math.floor(140 * SCALE) - Math.floor(38 * SCALE), Math.floor(52 * SCALE), Math.floor(38 * SCALE), Math.floor(80 * SCALE), 1.7, 0));
    cakes.push(new Cake(Math.floor(780 * SCALE), groundY - Math.floor(220 * SCALE) - Math.floor(38 * SCALE), Math.floor(66 * SCALE), Math.floor(38 * SCALE), Math.floor(110 * SCALE), 2.0, 1));
    cakes.push(new Cake(Math.floor(1180 * SCALE), groundY - Math.floor(160 * SCALE) - Math.floor(38 * SCALE), Math.floor(58 * SCALE), Math.floor(38 * SCALE), Math.floor(100 * SCALE), 2.2, 2));
    cakes.push(new Cake(Math.floor(1560 * SCALE), groundY - Math.floor(240 * SCALE) - Math.floor(38 * SCALE), Math.floor(50 * SCALE), Math.floor(38 * SCALE), Math.floor(65 * SCALE), 1.8, 0));
    cakes.push(new Cake(Math.floor(2000 * SCALE), groundY - Math.floor(180 * SCALE) - Math.floor(38 * SCALE), Math.floor(74 * SCALE), Math.floor(38 * SCALE), Math.floor(130 * SCALE), 2.4, 1));
    cakes.push(new Cake(Math.floor(2480 * SCALE), groundY - Math.floor(130 * SCALE) - Math.floor(38 * SCALE), Math.floor(62 * SCALE), Math.floor(38 * SCALE), Math.floor(95 * SCALE), 1.5, 2));

    // Ground Roaming Cakes
    cakes.push(new Cake(Math.floor(920 * SCALE), groundY - Math.floor(38 * SCALE), Math.floor(58 * SCALE), Math.floor(38 * SCALE), Math.floor(170 * SCALE), 1.3, 0));
    cakes.push(new Cake(Math.floor(1820 * SCALE), groundY - Math.floor(38 * SCALE), Math.floor(60 * SCALE), Math.floor(38 * SCALE), Math.floor(210 * SCALE), 1.1, 1));

    // Player & Goal Present
    player = new Player(Math.floor(50 * SCALE), groundY - Math.floor(64 * SCALE));
    present = new Present(Math.floor(worldWidth - 140 * SCALE), groundY - Math.floor(40 * SCALE));

    lives = 3;
    totalJumps = 0;
    missionStartTime = Date.now();
    updateHUD();

    if (overlay) overlay.classList.add('hidden');
    const gw = document.getElementById('game-wrap');
    if (gw) gw.classList.remove('game-over');
  }

  // Player hit / death handler
  function resetPlayer() {
    deaths++;
    lives = Math.max(0, lives - 1);
    updateHUD();

    if (lives <= 0) {
      // Game Over state
      gameOver = true;
      if (overlayTitle) overlayTitle.textContent = 'MISSION FAILED: PAL DOWN';
      if (overlaySub) overlaySub.textContent = 'The cosmic monster cakes overran Mars. Press R or click below to launch another rescue mission!';
      if (overlayBadge) {
        overlayBadge.textContent = 'CRITICAL FAILURE';
        overlayBadge.style.color = '#ff4d4d';
        overlayBadge.style.borderColor = '#ff4d4d';
      }
      if (statTime) statTime.textContent = ((Date.now() - missionStartTime) / 1000).toFixed(1) + 's';
      if (statJumps) statJumps.textContent = totalJumps;
      if (statDeaths) statDeaths.textContent = deaths;

      if (overlay) overlay.classList.remove('hidden');
      const gw = document.getElementById('game-wrap');
      if (gw) gw.classList.add('game-over');

      if (window.__gameAudio?.playGameOver) window.__gameAudio.playGameOver();
      return;
    }

    // Dramatic hit pause & screen shake
    resetPause = { t: 0, duration: 45 };
    timeScaleTarget = 0.2;
    cameraShake = 16;
    keys.left = keys.right = keys.up = false;

    // Disintegration spark burst
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    for (let i = 0; i < 24; i++) {
      effects.push(new Particle(px, py, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, ['#ff4444', '#ff8844', '#ffd043'][Math.floor(Math.random() * 3)], 5, 35, 'spark'));
    }
    if (window.__gameAudio?.playWhoosh) window.__gameAudio.playWhoosh();
  }

  // =========================================================================
  // Game Loop: Update & Render
  // =========================================================================
  function update() {
    timeScale += (timeScaleTarget - timeScale) * 0.14;
    cameraShake *= 0.90;
    cameraShakeX = (Math.random() * 2 - 1) * cameraShake;
    cameraShakeY = (Math.random() * 2 - 1) * cameraShake;
    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - 0.05);

    env.update(camera.x);

    // Present Liberation Sequence
    if (presentSequence) {
      presentSequence.t = (presentSequence.t || 0) + 1;

      if (presentSequence.t === 1) {
        const px = present.x + present.w / 2;
        const py = present.y + present.h / 2;

        // Massive Celebration Explosion
        flashAlpha = 0.8;
        cameraShake = 18;
        timeScaleTarget = 0.25;

        // Shockwave
        effects.push(new Particle(px, py, 0, 0, '#00e5ff', 50, 30, 'shockwave'));

        // Confetti & Sparks Fountain
        for (let i = 0; i < 80; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = Math.random() * 8 + 3;
          effects.push(new Particle(px, py, Math.cos(ang) * sp, Math.sin(ang) * sp - 4, ['#ff007f', '#00e5ff', '#ffd700', '#00ffaa', '#ffffff'][Math.floor(Math.random() * 5)], Math.random() * 6 + 3, 70, Math.random() > 0.4 ? 'confetti' : 'spark'));
        }

        // Spawn Astro Steve
        const astro = new Astro(px, present.y - 20);
        effects.push(astro);

        if (window.__gameAudio?.playExplosion) window.__gameAudio.playExplosion();
        if (window.__gameAudio?.playShout) window.__gameAudio.playShout();
      }

      // Ongoing celebratory confetti
      if (presentSequence.t % 8 === 0) {
        const px = present.x + present.w / 2;
        const py = present.y + present.h / 2;
        for (let i = 0; i < 6; i++) {
          effects.push(new Particle(px + (Math.random() - 0.5) * 80, py, (Math.random() - 0.5) * 5, -Math.random() * 4 - 2, ['#ff007f', '#00e5ff', '#ffd700'][Math.floor(Math.random() * 3)], 4, 50, 'confetti'));
        }
      }

      // Update effects
      for (const e of effects) e.update(effects);
      for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].alive()) effects.splice(i, 1);

      if (presentSequence.t > 210) {
        timeScaleTarget = 1.0;
        cameraShake = 0;
        gameWon = true;
        gameOver = true;

        if (overlayTitle) overlayTitle.textContent = 'YOU FREED ASTRO STEVE!';
        if (overlaySub) overlaySub.textContent = 'Astro Steve blasted past Phobos heading home to Earth! Mars is safe once again.';
        if (overlayBadge) {
          overlayBadge.textContent = 'MISSION ACCOMPLISHED';
          overlayBadge.style.color = '#00e5ff';
          overlayBadge.style.borderColor = '#00e5ff';
        }
        if (statTime) statTime.textContent = ((Date.now() - missionStartTime) / 1000).toFixed(1) + 's';
        if (statJumps) statJumps.textContent = totalJumps;
        if (statDeaths) statDeaths.textContent = deaths;

        if (overlay) overlay.classList.remove('hidden');
        endScreenStarted = true;
        endScreenTimer = 0;
        presentSequence = null;
      }
      return;
    }

    // Reset Pause (Hit by cake)
    if (resetPause) {
      resetPause.t = (resetPause.t || 0) + 1;
      for (const e of effects) e.update(effects);
      for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].alive()) effects.splice(i, 1);

      if (resetPause.t > resetPause.duration) {
        player.reset();
        resetPause = null;
        timeScaleTarget = 1.0;
        cameraShake = 0;
      }
      return;
    }

    // Deep Space Starfield after victory
    if (endScreenStarted) {
      endScreenTimer += 1;
      if (!starfieldActive && endScreenTimer > 180) {
        starfieldActive = true;
        if (window.__gameAudio?.startMyHeartLoop && !starfieldLoopStarted) {
          window.__gameAudio.startMyHeartLoop();
          starfieldLoopStarted = true;
        }
      }
      if (starfieldActive && starfieldAlpha < 1) starfieldAlpha = Math.min(1, starfieldAlpha + 0.015);

      if (starfieldActive) {
        starfieldSpawnTimer -= 1;
        if (starfieldSpawnTimer <= 0) {
          const fromLeft = Math.random() > 0.5;
          const astro = new Astro(fromLeft ? -60 : camera.width + 60, Math.random() * (camera.height * 0.5) + 40, Math.random() < 0.3 ? 'STEVE! 🚀' : 'BEST GNOME EVER! ⭐');
          astro.vx = fromLeft ? 4.2 + Math.random() * 2 : -4.2 - Math.random() * 2;
          astro.vy = -1.5 - Math.random() * 1.5;
          effects.push(astro);
          starfieldSpawnTimer = Math.floor(Math.random() * 400 + 300);
        }
      }
    }

    if (gameOver) return;

    // Normal Entity Updates
    for (const c of cakes) c.update(effects);
    player.update(platforms, effects);

    // Cake collisions with player
    for (const c of cakes) {
      if (aabb({ x: c.x + 8, y: c.y + 6, w: c.w - 16, h: c.h - 8 }, { x: player.x + 8, y: player.y + 6, w: player.w - 16, h: player.h - 8 })) {
        resetPlayer();
        return;
      }
    }

    // Present collision
    if (aabb({ x: present.x, y: present.y, w: present.w, h: present.h }, { x: player.x, y: player.y, w: player.w, h: player.h })) {
      presentSequence = { t: 0 };
      if (overlay) overlay.classList.add('hidden');
      return;
    }

    // Smooth Camera Follow with look-ahead
    camera.targetX = Math.max(0, Math.min(player.x + player.w / 2 - camera.width / 2 + player.vx * 15, worldWidth - camera.width));
    camera.x += (camera.targetX - camera.x) * 0.10;

    // Advance general effects
    for (const e of effects) e.update(effects);
    for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].alive()) effects.splice(i, 1);

    updateHUD();
  }

  function draw() {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, camera.width, camera.height);

    lighting.clear();

    const groundY = camera.height - Math.floor(64 * SCALE);

    // 1. Sky & Celestial Layer
    env.drawSkyAndCelestial(ctx, camera.x, camera.y);

    // 2. Parallax Mountain & Outpost Layers
    env.drawParallaxLayers(ctx, camera.x, groundY);

    // 3. Camera Shake Transform for World Entities
    ctx.save();
    ctx.translate(cameraShakeX, cameraShakeY);

    // Platforms & Ground
    for (const p of platforms) p.draw(ctx, camera.x, camera.y);

    // Goal Present
    if (present) present.draw(ctx, camera.x, camera.y);

    // Cakes
    for (const c of cakes) c.draw(ctx, camera.x, camera.y);

    // Player
    if (player && !resetPause) player.draw(ctx, camera.x, camera.y);

    // Particles & Special Entities (Astro Steve)
    for (const e of effects) e.draw(ctx, camera.x, camera.y);

    // 4. 2D Dynamic Lighting & Bloom Overlay
    lighting.render(ctx, camera);

    ctx.restore(); // restore camera shake

    // 5. Atmospheric Horizon Fog & Screen Vignette
    env.drawAtmosphericFog(ctx, groundY);

    // 6. Flash effect on explosion
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, camera.width, camera.height);
    }

    // 7. Starfield Win Mode Overlay
    if (starfieldAlpha > 0) {
      if (starfieldStars.length === 0) {
        for (let i = 0; i < 120; i++) {
          starfieldStars.push({ x: Math.random() * camera.width, y: Math.random() * camera.height, size: Math.random() * 2.5 + 0.5, tw: Math.random() * 0.05 + 0.01 });
        }
      }
      ctx.save();
      ctx.globalAlpha = starfieldAlpha;
      ctx.fillStyle = 'rgba(8, 3, 12, 0.94)';
      ctx.fillRect(0, 0, camera.width, camera.height);

      for (const s of starfieldStars) {
        const flick = 0.5 + Math.sin(Date.now() * 0.003 + s.x) * 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * flick})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // Touch & Controls Integration
  // =========================================================================
  function setupTouchControls() {
    const tc = document.getElementById('touch-controls');
    const left = document.getElementById('tc-left');
    const right = document.getElementById('tc-right');
    const jump = document.getElementById('tc-jump');
    if (!tc || !left || !right || !jump) return;

    tc.classList.remove('hidden');

    const handlePress = (btn, keyName, isDown) => {
      keys[keyName] = isDown;
      if (isDown) btn.classList.add('active');
      else btn.classList.remove('active');
    };

    [left, right, jump].forEach(b => {
      b.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    });

    left.addEventListener('touchstart', () => handlePress(left, 'left', true));
    left.addEventListener('touchend', () => handlePress(left, 'left', false));
    right.addEventListener('touchstart', () => handlePress(right, 'right', true));
    right.addEventListener('touchend', () => handlePress(right, 'right', false));

    jump.addEventListener('touchstart', () => {
      keys.up = true;
      jump.classList.add('active');
      setTimeout(() => {
        keys.up = false;
        jump.classList.remove('active');
      }, 260);
    });
  }

  // Start & Restart Handlers
  function startGame() {
    if (splash) splash.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    const gw = document.getElementById('game-wrap');
    if (gw) gw.classList.remove('game-over');

    resize();
    createLevel();

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      setupTouchControls();
    }

    if (window.__gameAudio?.start) window.__gameAudio.start();

    gameOver = false;
    gameStarted = true;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  if (restartBtn) restartBtn.addEventListener('click', () => { createLevel(); startGame(); });
  if (playBtn) playBtn.addEventListener('click', startGame);

  if (audioToggle) {
    audioToggle.addEventListener('click', () => {
      if (window.__gameAudio) {
        const isMuted = window.__gameAudio.toggleMute();
        audioToggle.textContent = isMuted ? '🔇' : '🔊';
      }
    });
  }

  window.startGame = startGame;
  createLevel();
})();

// =========================================================================
// Enhanced Web Audio API Synthesizer (Chiptune + SFX)
// =========================================================================
(() => {
  let ctx = null;
  let masterGain = null;
  let isPlaying = false;
  let isMuted = false;
  let loopTimer = null;
  const activeNodes = new Set();

  function trackNode(n) {
    if (!n) return;
    activeNodes.add(n);
    const cleanup = () => { activeNodes.delete(n); };
    if (typeof n.onended !== 'undefined') n.onended = cleanup;
    else setTimeout(cleanup, 3500);
  }

  function clearScheduledNodes() {
    for (const n of Array.from(activeNodes)) {
      try { if (typeof n.stop === 'function') n.stop(); } catch (e) {}
      try { if (typeof n.disconnect === 'function') n.disconnect(); } catch (e) {}
    }
    activeNodes.clear();
  }

  const tempo = 136;
  const beatSec = 60 / tempo;

  const leadPattern = [
    { n: 'A4', d: 1 }, { n: 'C5', d: 0.5 }, { n: 'E5', d: 0.5 }, { n: 'A5', d: 1 },
    { n: 'G5', d: 0.5 }, { n: 'E5', d: 0.5 }, { n: 'C5', d: 1 }, { n: 'A4', d: 1 },
    { n: 'F4', d: 1 }, { n: 'E4', d: 1 }, { n: 'D4', d: 1 }, { n: 'C4', d: 1 },
    { n: 'A3', d: 0.5 }, { n: 'C4', d: 0.5 }, { n: 'E4', d: 1 }, { n: 'A4', d: 1 }
  ];
  const bassPattern = [
    { n: 'A2', d: 2 }, { n: 'A2', d: 2 }, { n: 'E2', d: 2 }, { n: 'E2', d: 2 }
  ];
  const arpPattern = [
    { n: 'A5', d: 0.5 }, { n: 'C6', d: 0.5 }, { n: 'E6', d: 0.5 }, { n: 'A6', d: 0.5 }
  ];
  const hatPattern = [1, 0, 1, 0, 1, 0, 1, 0];

  function noteFreq(name) {
    if (!name) return 0;
    const notes = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
    const m = name.match(/^([A-G]#?b?)(\d+)$/);
    if (!m) return 0;
    const p = notes[m[1]];
    const octave = parseInt(m[2], 10);
    const semis = (octave - 4) * 12 + (p - 9);
    return 440 * Math.pow(2, semis / 12);
  }

  function startAudio() {
    if (isPlaying) return;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = isMuted ? 0 : 0.18;
      masterGain.connect(ctx.destination);
    }
    isPlaying = true;
    scheduleLoop();
  }

  function stopAudio() {
    if (!isPlaying) return;
    isPlaying = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    clearScheduledNodes();
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.18, ctx.currentTime);
    }
    return isMuted;
  }

  function playJump() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
      trackNode(osc);
    } catch (e) {}
  }

  function playDoubleJump() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.22);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.24);
      trackNode(osc);
    } catch (e) {}
  }

  function playExplosion() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.02;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.09));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      src.connect(g);
      g.connect(masterGain);
      src.start(now);
      src.stop(now + 0.38);
      trackNode(src);
    } catch (e) {}
  }

  function playWhoosh() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.02;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, now);
      o.frequency.linearRampToValueAtTime(1100, now + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.6);
      trackNode(o);
    } catch (e) {}
  }

  function playShout() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.02;
      const notes = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
      let t = now;
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(noteFreq(n), t);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.14, t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(og);
        og.connect(masterGain);
        o.start(t);
        o.stop(t + 0.2);
        trackNode(o);
        t += 0.09;
      }
    } catch (e) {}
  }

  function playGameOver() {
    try {
      if (!ctx || isMuted) return;
      const now = ctx.currentTime + 0.05;
      const notes = ['A4', 'F4', 'D4', 'C4', 'A3'];
      let t = now;
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(noteFreq(n), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g);
        g.connect(masterGain);
        o.start(t);
        o.stop(t + 0.9);
        trackNode(o);
        t += 0.55;
      }
    } catch (e) {}
  }

  function scheduleLoop() {
    if (!ctx || !isPlaying) return;
    const start = ctx.currentTime + 0.06;
    let t = start;
    const loopDur = leadPattern.reduce((s, p) => s + p.d * beatSec, 0);

    // Lead notes
    for (const step of leadPattern) {
      if (step.n && !isMuted) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(noteFreq(step.n), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + step.d * beatSec);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t);
        osc.stop(t + step.d * beatSec + 0.02);
        trackNode(osc);
      }
      t += step.d * beatSec;
    }

    // Bass notes
    t = start;
    for (const step of bassPattern) {
      if (step.n && !isMuted) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(noteFreq(step.n), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + step.d * beatSec);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 650;
        osc.connect(g);
        g.connect(lp);
        lp.connect(masterGain);
        osc.start(t);
        osc.stop(t + step.d * beatSec + 0.02);
        trackNode(osc);
      }
      t += step.d * beatSec;
    }

    loopTimer = setTimeout(() => {
      if (isPlaying) scheduleLoop();
    }, loopDur * 1000 - 30);
  }

  window.__gameAudio = {
    start: startAudio,
    stop: stopAudio,
    toggleMute,
    playJump,
    playDoubleJump,
    playExplosion,
    playWhoosh,
    playShout,
    playGameOver
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAudio();
  });
})();