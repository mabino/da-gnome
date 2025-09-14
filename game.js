// Simple HTML5 Canvas platformer: Jump the cakes to reach the present
(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const deathsEl = document.getElementById('deaths');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const restartBtn = document.getElementById('restart');

  // camera viewport (declare early so resize() can reference it)
  let camera = { x:0, y:0, width: 0, height: 0 };
  // cinematic helpers
  let timeScale = 1.0; // used to slow down updates during explosions
  let timeScaleTarget = 1.0;
  let cameraShake = 0;
  let cameraShakeX = 0;
  let cameraShakeY = 0;

  // Resize canvas to CSS size while keeping internal resolution
  function resize() {
    const ratio = 2; // increase resolution for crisper graphics
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(480, Math.floor(rect.width * ratio));
    canvas.height = Math.max(270, Math.floor(rect.height * ratio));
    // keep camera viewport in sync with the actual canvas resolution
    camera.width = canvas.width;
    camera.height = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  // Physics constants
  const GRAV = 0.9;
  const FRICTION = 0.86;
  const MOVE_SPEED = 2.6;
  const JUMP_SPEED = 16.5;
  // second (mid-air) jump gives a smaller boost than the ground jump
  const DOUBLE_JUMP_MULT = 0.6;
  // global scale multiplier for larger, clearer assets
  const SCALE = 1.45;

  let deaths = 0;
  let lives = 3; // player has 3 lives before game over

  const livesEl = document.getElementById('lives');
  function renderLives(){
    if (!livesEl) return;
    livesEl.innerHTML = '';
    for(let i=0;i<lives;i++){
      const d = document.createElement('div'); d.className = 'life'; livesEl.appendChild(d);
    }
  }

  // Input state
  const keys = { left:false, right:false, up:false };
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code==='KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code==='KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code==='KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code==='KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
  });

  // Entities
  class Player {
    constructor(x,y){ this.startX = x; this.startY = y; this.reset(); }
  reset(){ this.x=this.startX; this.y=this.startY; this.w=Math.floor(48 * SCALE); this.h=Math.floor(64 * SCALE); this.vx=0; this.vy=0; this.onGround=false; this.jumpCount = 0; this._upHeld = false; }
    update(platforms){
      // horizontal movement
      if(keys.left) this.vx -= MOVE_SPEED * 0.25;
      if(keys.right) this.vx += MOVE_SPEED * 0.25;
      // apply friction
      this.vx *= FRICTION;
      // gravity
      this.vy += GRAV;
      // jump (edge-detected): allow one mid-air jump (double-jump) with a smaller boost
      if (keys.up && !this._upHeld){
        if (this.onGround){
          // normal ground jump
          this.vy = -JUMP_SPEED;
          this.onGround = false;
          // ensure mid-air jump counter is reset when leaving ground via jump
          this.jumpCount = 0;
        } else if (this.jumpCount < 1){
          // second jump (weaker boost)
          this.vy = -Math.abs(JUMP_SPEED * DOUBLE_JUMP_MULT);
          this.jumpCount += 1;
          // slight camera feedback to emphasize the mid-air boost
          cameraShake = Math.max(cameraShake, 6);
          // small whoosh sound if available
          if (window.__gameAudio && typeof window.__gameAudio.playWhoosh === 'function') window.__gameAudio.playWhoosh();
        }
        this._upHeld = true; // consume this press until release
      }
      if (!keys.up) this._upHeld = false;
      // apply velocities
      this.x += this.vx;
      this.y += this.vy;
      // simple world bounds
      if(this.x < 0) this.x = 0, this.vx = 0;
      if(this.x + this.w > worldWidth) this.x = worldWidth - this.w, this.vx = 0;

  // platform collisions (top only)
      this.onGround = false;
      for(const p of platforms){
        if (this.x + this.w > p.x && this.x < p.x + p.w){
          // check if falling and crossed into platform from above
          const prevY = this.y - this.vy;
          if (prevY + this.h <= p.y && this.y + this.h >= p.y && this.vy >= 0){
            this.y = p.y - this.h;
            this.vy = 0;
            this.onGround = true;
          }
        }
      }

      // if we've landed, reset mid-air jump counter so player can double-jump again
      if (this.onGround) this.jumpCount = 0;

      // eliminate tiny floating point drift
      if (Math.abs(this.vx) < 0.02) this.vx = 0;

    }
    draw(ctx){
      // bigger gnome character with feet aligned to ground
      ctx.save();
        // animation state: facing and run timer
        if (!this.hasOwnProperty('anim')) this.anim = 0;
        if (!this.hasOwnProperty('facing')) this.facing = 1;
        // update facing
        if (this.vx > 0.2) this.facing = 1;
        else if (this.vx < -0.2) this.facing = -1;
        // if moving on ground, advance run animation, else decay
        const moving = Math.abs(this.vx) > 0.4 && this.onGround;
        if (moving) this.anim += 0.22 * Math.min(1, Math.abs(this.vx));
        else this.anim *= 0.6;

      // compute a small foot depth based on the original leg offsets so feet land exactly at player's bottom
      const footDepth = Math.round((10 + 18) * SCALE); // original leg y offset + leg height, scaled
      ctx.translate(this.x + this.w/2, this.y + this.h - footDepth);

      const s = SCALE;
  // legs (animated when running) — compute swing and lift from anim
  const lx = Math.round(-14 * s);
  const rx = Math.round(4 * s);
  const legW = Math.round(12 * s);
  const legH = Math.round(18 * s);
  const legY = Math.round(10 * s);
  const movingFactor = (moving ? Math.min(1, Math.abs(this.vx) / 6) : 0);
  const strideX = Math.round(6 * s) * movingFactor;
  const liftY = Math.round(6 * s) * movingFactor;
  const leftPhase = this.anim;
  const rightPhase = this.anim + Math.PI;
  const leftSwingX = Math.round(Math.sin(leftPhase) * strideX);
  const rightSwingX = Math.round(Math.sin(rightPhase) * strideX);
  const leftLift = Math.round(Math.max(0, -Math.sin(leftPhase)) * liftY);
  const rightLift = Math.round(Math.max(0, -Math.sin(rightPhase)) * liftY);
  ctx.fillStyle = '#5b3a29';
  // left leg (apply horizontal swing and vertical lift)
  ctx.fillRect(lx + leftSwingX, legY - leftLift, legW, legH);
  // right leg
  ctx.fillRect(rx + rightSwingX, legY - rightLift, legW, legH);
  // boots soles (follow lift so the sole moves up when lifted)
  const soleH = Math.max(2, Math.round(4 * s));
  ctx.fillStyle = '#301a10';
  ctx.fillRect(lx + leftSwingX, legY - leftLift + legH - soleH, legW, soleH);
  ctx.fillRect(rx + rightSwingX, legY - rightLift + legH - soleH, legW, soleH);

      // arms and torso: animate arms opposite to legs and tilt body slightly in running direction
      const bodyRx = Math.round(20 * s);
      const bodyRy = Math.round(24 * s);
      // arm parameters
  const armLen = Math.round(18 * s);
  const armW = Math.max(3, Math.round(6 * s));
  // move shoulders down and slightly inward so arms appear from the torso rather than the head
  const shoulderY = -Math.round(6 * s);
  const shoulderX = Math.round(8 * s);
      // arm angles tie to leg phases (arms swing opposite legs)
      const leftArmAngle = -Math.sin(leftPhase) * 0.9 * movingFactor; // radians-ish
      const rightArmAngle = -Math.sin(rightPhase) * 0.9 * movingFactor;
      // body tilt: small rotation toward running direction, eased by movingFactor
      const tiltMax = 0.10; // radians (~5.7 degrees)
      const tilt = this.facing * tiltMax * movingFactor * Math.min(1, Math.abs(this.vx) / 6);

      // determine layering: which arm is front? if left leg forward, left arm is back (arms opposite legs)
      const leftLegForward = Math.sin(leftPhase) > 0;

      // draw back arm first
      if (leftLegForward){
        // left leg forward -> left arm back, so right arm is front -> draw left arm (back) first
        ctx.save();
        ctx.translate(-shoulderX, shoulderY);
        ctx.rotate(leftArmAngle);
        ctx.fillStyle = '#ffd7b5'; // skin tone
        ctx.fillRect(0, -Math.round(armW/2), armLen, armW);
        ctx.restore();
      } else {
        // right leg forward -> right arm back, draw right arm (back) first
        ctx.save();
        ctx.translate(shoulderX, shoulderY);
        ctx.rotate(rightArmAngle);
        ctx.fillStyle = '#ffd7b5'; ctx.fillRect(0, -Math.round(armW/2), armLen, armW);
        ctx.restore();
      }

      // draw body + head rotated slightly for perspective
      ctx.save();
      ctx.rotate(tilt);
      ctx.fillStyle = '#2b6cb0';
      ctx.beginPath(); ctx.ellipse(0, -Math.round(6 * s), bodyRx, bodyRy, 0, 0, Math.PI*2); ctx.fill();
      // tunic shading
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(0, -Math.round(2 * s), Math.round(bodyRx*0.7), Math.round(bodyRy*0.45), 0, 0, Math.PI*2); ctx.fill();
      // belt and buckle
      ctx.fillStyle = '#2d2d2d'; ctx.fillRect(-Math.round(14 * s), Math.round(6 * s), Math.round(28 * s), Math.round(6 * s));
      ctx.fillStyle = '#ffd97a'; ctx.fillRect(-Math.round(4 * s), Math.round(6 * s), Math.round(8 * s), Math.round(6 * s));
    // head
    const headR = Math.round(14 * s);
    ctx.beginPath(); ctx.fillStyle = '#ffd7b5'; ctx.arc(0, -Math.round(20 * s), headR, 0, Math.PI*2); ctx.fill();

  // smaller hat sitting on top of the head (not covering the face)
  ctx.save();
  // position hat so its rim sits roughly at the top of the head
  ctx.translate(0, -Math.round(32 * s));
  ctx.beginPath();
  ctx.moveTo(0, -Math.round(26 * s));
  ctx.lineTo(-Math.round(18 * s), Math.round(8 * s));
  ctx.lineTo(Math.round(18 * s), Math.round(8 * s));
  ctx.closePath();
  ctx.fillStyle = '#d94c67'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, Math.round(1 * s)); ctx.stroke();
  // brim
  ctx.fillStyle = '#b33f55'; ctx.fillRect(-Math.round(22 * s), Math.round(8 * s), Math.round(44 * s), Math.round(6 * s));
  // small decorative stripe
  ctx.fillStyle = '#ffd97a'; ctx.fillRect(-Math.round(8 * s), Math.round(0 * s), Math.round(16 * s), Math.round(5 * s));
  ctx.restore();

  // beard: fuller cheeks and a pointed bottom so the face remains visible
  ctx.beginPath(); ctx.fillStyle = '#fff1e0';
  const bLeft = -Math.round(16 * s);
  const bRight = Math.round(16 * s);
  const bTop = -Math.round(6 * s);
  const bTipY = Math.round(22 * s);
  // left cheek down to tip, then up to right cheek
  ctx.moveTo(bLeft, bTop);
  ctx.quadraticCurveTo(-Math.round(8 * s), Math.round(10 * s), 0, bTipY);
  ctx.quadraticCurveTo(Math.round(8 * s), Math.round(10 * s), bRight, bTop);
  ctx.closePath(); ctx.fill();
  // nose (slightly smaller so beard frames rather than hides it)
  ctx.beginPath(); ctx.fillStyle='#ffcc99'; ctx.arc(0, -Math.round(14 * s), Math.round(4 * s), 0, Math.PI*2); ctx.fill();
    // eyes with small highlight (drawn on top so they're visible)
    ctx.fillStyle='#111'; ctx.fillRect(-Math.round(6 * s), -Math.round(22 * s), Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(3 * s))); ctx.fillRect(Math.round(3 * s), -Math.round(22 * s), Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(3 * s)));
    ctx.fillStyle = '#fff'; ctx.fillRect(-Math.round(5 * s), -Math.round(21 * s), Math.max(1, Math.round(1 * s)), Math.max(1, Math.round(1 * s)));
      ctx.restore();

      // draw front arm last so it overlays the body
      if (leftLegForward){
        // left forward -> right arm front
        ctx.save(); ctx.translate(shoulderX, shoulderY); ctx.rotate(rightArmAngle); ctx.fillStyle = '#ffd7b5'; ctx.fillRect(0, -Math.round(armW/2), armLen, armW); ctx.restore();
      } else {
        ctx.save(); ctx.translate(-shoulderX, shoulderY); ctx.rotate(leftArmAngle); ctx.fillStyle = '#ffd7b5'; ctx.fillRect(0, -Math.round(armW/2), armLen, armW); ctx.restore();
      }
      ctx.restore();
    }
  }


  class Platform { constructor(x,y,w,h){ this.x=x; this.y=y; this.w=w; this.h=h;} draw(ctx){ ctx.fillStyle='#6b4f3a'; ctx.fillRect(this.x,this.y,this.w,this.h); } }

  class Cake {
    constructor(x,y,w,h,range,speed){ this.x=x; this.y=y; this.w=w; this.h=h; this.baseX=x; this.range=range; this.speed=speed; this.dir=1; this.phase = Math.random()*Math.PI*2; }
    update(){ if (typeof gameOver !== 'undefined' && gameOver) return; this.x += this.speed * this.dir; if (this.x > this.baseX + this.range) this.dir = -1; if (this.x < this.baseX - this.range) this.dir = 1; this.phase += 0.08 * (0.8 + Math.abs(this.speed)*0.2); }
    draw(ctx){
      // cake base
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = '#f6c2d2'; ctx.fillRect(0,0,this.w,this.h);
      // frosting
      ctx.fillStyle = '#fff'; ctx.fillRect(0,-8,this.w,10);
      // candles
      const ccount = Math.max(1, Math.floor(this.w/28));
      for(let i=0;i<ccount;i++){
        const cx = 6 + i*(this.w/(ccount)) + 6;
        ctx.fillStyle='#ffeb99'; ctx.fillRect(cx-2, -20, 4, 12);
        // flame
        ctx.beginPath(); ctx.fillStyle='#ffb74d'; ctx.ellipse(cx, -24, 3, 4,0,0,Math.PI*2); ctx.fill();
      }
      // mouth animation - opening/closing based on phase
      const mouthOpen = 6 + Math.sin(this.phase) * 6; // px
      const mx = this.w * 0.12;
      const mw = this.w * 0.76;
      ctx.fillStyle = '#2b1a1a';
      ctx.fillRect(mx, -2, mw, mouthOpen);
      // teeth
      ctx.fillStyle = '#fff1d6';
      const teethW = Math.max(3, Math.floor(mw / 6));
      for(let tx = mx + 4; tx < mx + mw - 4; tx += teethW + 2){ ctx.fillRect(tx, -2, teethW, 3); }
      ctx.restore();
    }
  }

  class Present { constructor(x,y){ this.x=x; this.y=y; this.w=Math.floor(36 * SCALE); this.h=Math.floor(32 * SCALE); } draw(ctx){ ctx.save(); ctx.translate(this.x,this.y); ctx.fillStyle='#7bd389'; ctx.fillRect(0,0,this.w,this.h); // ribbon
      ctx.fillStyle='#d94c67'; ctx.fillRect(this.w/2 -4,0,8,this.h);
      ctx.fillRect(0,this.h/2 -4,this.w,8);
      // bow
      ctx.beginPath(); ctx.fillStyle='#d94c67'; ctx.ellipse(6,6,6,4,0,0,Math.PI*2); ctx.ellipse(this.w-6,6,6,4,0,0,Math.PI*2); ctx.fill();
      ctx.restore(); }
  }

  // simple particle used for explosion and bits
  class Particle {
    constructor(x,y,vx,vy,color){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.color=color||'#ffcc66'; this.age=0; this.ttl=50 + Math.floor(Math.random()*40); }
    update(){ // respect global timeScale so slow-motion affects particles
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += 0.12 * timeScale;
      this.vx *= Math.pow(0.995, timeScale);
      this.age += 1 * timeScale;
    }
    draw(ctx){ const a = Math.max(0, 1 - this.age/this.ttl); ctx.globalAlpha = a; ctx.fillStyle = this.color; ctx.fillRect(this.x-2,this.y-2,4,4); ctx.globalAlpha = 1; }
    alive(){ return this.age < this.ttl; }
  }

  // Astro Steve flies off shouting THANKS!!!
  class Astro {
    constructor(x,y, bubbleText){ this.x = x; this.y = y; this.vx = 4.5 + Math.random()*1.8; this.vy = -7 - Math.random()*3; this.age=0; this.ttl = 320; this.scale = 1.6 + Math.random()*0.6; this.bubbleAlpha = 0; this.bubbleOffset = 0; this.bubbleText = bubbleText || 'THANKS!!!'; }
    update(){ // respect global timeScale so slow-mo affects flight
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += 0.06 * timeScale;
      this.vx *= 0.998;
      this.age += 1 * timeScale;
      // animate speech bubble entrance
      if (this.bubbleAlpha < 1) this.bubbleAlpha = Math.min(1, this.bubbleAlpha + 0.08 * (1/timeScale));
      this.bubbleOffset = Math.min(8, this.bubbleOffset + 0.6 * (1/timeScale));
    }
    draw(ctx){ ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.scale, this.scale);
  // animated speech bubble (alpha + slight upward float)
  ctx.globalAlpha = this.bubbleAlpha;
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(24, -56 - this.bubbleOffset, 150, 36);
  ctx.fillStyle = '#b00'; ctx.font = (18) + 'px sans-serif'; ctx.fillText(this.bubbleText || 'THANKS!!!', 36, -33 - this.bubbleOffset);
      ctx.globalAlpha = 1;
      // bigger astronaut body and helmet
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -10, 12, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#ccc'; ctx.fillRect(-10,10,20,22);
      // small jetpack flame for flair
      ctx.beginPath(); ctx.fillStyle = '#ff9f4d'; ctx.moveTo(-6, 18); ctx.lineTo(0, 28 + Math.random()*6); ctx.lineTo(6, 18); ctx.closePath(); ctx.fill();
      ctx.restore(); }
    alive(){ return this.age < this.ttl; }
  }

  // world and level setup
  let worldWidth = Math.floor(3000 * SCALE); // long level to run toward a present at right
  // camera already declared above; initialize its size from the canvas
  camera.x = 0; camera.y = 0; camera.width = canvas.width; camera.height = canvas.height;
  let rafId = null;
  let gameOver = false;
  let presentSequence = null; // when present is reached, play explosion -> astro sequence
  let resetPause = null; // cinematic pause when player collides with cake before respawn
  // end-screen / starfield state (when overlay is shown after win)
  let endScreenStarted = false;
  let endScreenTimer = 0; // frames since overlay shown
  let starfieldActive = false;
  let starfieldAlpha = 0;
  let starfieldStars = [];
  let starfieldSpawnTimer = 0; // frames until next astro flyby
  let starfieldLoopStarted = false;

  const platforms = [];
  const cakes = [];
  const effects = [];
  let player, present;

  function createLevel(){
    // ground across world
    platforms.length = 0; cakes.length = 0;
  effects.length = 0;
  presentSequence = null;
  const groundH = Math.floor(60 * SCALE);
  platforms.push(new Platform(0, canvas.height - groundH, worldWidth, groundH));
  // some floating platforms (scaled)
  platforms.push(new Platform(Math.floor(320 * SCALE), canvas.height - Math.floor(160 * SCALE), Math.floor(220 * SCALE), Math.floor(16 * SCALE)));
  platforms.push(new Platform(Math.floor(700 * SCALE), canvas.height - Math.floor(240 * SCALE), Math.floor(180 * SCALE), Math.floor(16 * SCALE)));
  platforms.push(new Platform(Math.floor(1100 * SCALE), canvas.height - Math.floor(180 * SCALE), Math.floor(240 * SCALE), Math.floor(16 * SCALE)));
  platforms.push(new Platform(Math.floor(1500 * SCALE), canvas.height - Math.floor(260 * SCALE), Math.floor(180 * SCALE), Math.floor(16 * SCALE)));
  platforms.push(new Platform(Math.floor(1900 * SCALE), canvas.height - Math.floor(200 * SCALE), Math.floor(220 * SCALE), Math.floor(16 * SCALE)));
  platforms.push(new Platform(Math.floor(2300 * SCALE), canvas.height - Math.floor(140 * SCALE), Math.floor(280 * SCALE), Math.floor(16 * SCALE)));

    // cakes on platforms (and some on ground) - x,y are top-left
  cakes.push(new Cake(Math.floor(380 * SCALE), canvas.height - Math.floor(160 * SCALE) - Math.floor(36 * SCALE), Math.floor(48 * SCALE), Math.floor(36 * SCALE), Math.floor(80 * SCALE), 1.6));
  cakes.push(new Cake(Math.floor(760 * SCALE), canvas.height - Math.floor(240 * SCALE) - Math.floor(36 * SCALE), Math.floor(64 * SCALE), Math.floor(36 * SCALE), Math.floor(120 * SCALE), 1.8));
  cakes.push(new Cake(Math.floor(1160 * SCALE), canvas.height - Math.floor(180 * SCALE) - Math.floor(36 * SCALE), Math.floor(56 * SCALE), Math.floor(36 * SCALE), Math.floor(100 * SCALE), 2.0));
  cakes.push(new Cake(Math.floor(1510 * SCALE), canvas.height - Math.floor(260 * SCALE) - Math.floor(36 * SCALE), Math.floor(48 * SCALE), Math.floor(36 * SCALE), Math.floor(60 * SCALE), 1.6));
  cakes.push(new Cake(Math.floor(1940 * SCALE), canvas.height - Math.floor(200 * SCALE) - Math.floor(36 * SCALE), Math.floor(72 * SCALE), Math.floor(36 * SCALE), Math.floor(140 * SCALE), 2.2));
  cakes.push(new Cake(Math.floor(2400 * SCALE), canvas.height - Math.floor(140 * SCALE) - Math.floor(36 * SCALE), Math.floor(60 * SCALE), Math.floor(36 * SCALE), Math.floor(90 * SCALE), 1.4));
  // some ground roaming cakes
  cakes.push(new Cake(Math.floor(900 * SCALE), canvas.height - groundH - Math.floor(36 * SCALE), Math.floor(56 * SCALE), Math.floor(36 * SCALE), Math.floor(160 * SCALE), 1.2));
  cakes.push(new Cake(Math.floor(1800 * SCALE), canvas.height - groundH - Math.floor(36 * SCALE), Math.floor(56 * SCALE), Math.floor(36 * SCALE), Math.floor(200 * SCALE), 1.0));

  player = new Player(Math.floor(40 * SCALE), canvas.height - Math.floor(60 * SCALE) - Math.floor(64 * SCALE));
    present = new Present(Math.floor(worldWidth - 120 * SCALE), canvas.height - Math.floor(60 * SCALE) - Math.floor(32 * SCALE));
    deaths = 0;
    deathsEl.textContent = deaths;
    overlay.classList.add('hidden');
    // reset lives display
    lives = 3;
    renderLives();
  }

  // Touch controls setup (wired when the page is touch-capable)
  function setupTouchControls(){
    const tc = document.getElementById('touch-controls');
    const left = document.getElementById('tc-left');
    const right = document.getElementById('tc-right');
    const jump = document.getElementById('tc-jump');
    if (!tc || !left || !right || !jump) return;
    // show touch UI
    tc.classList.remove('hidden');
    // prevent double-tap zoom scrolling
    [left,right,jump].forEach(b=>{ b.addEventListener('touchstart', e=> e.preventDefault()); });
    left.addEventListener('touchstart', ()=> { keys.left = true; left.classList.add('active'); }); left.addEventListener('touchend', ()=> { keys.left = false; left.classList.remove('active'); });
    right.addEventListener('touchstart', ()=> { keys.right = true; right.classList.add('active'); }); right.addEventListener('touchend', ()=> { keys.right = false; right.classList.remove('active'); });
    jump.addEventListener('touchstart', ()=> { keys.up = true; jump.classList.add('active'); setTimeout(()=>{ keys.up = false; jump.classList.remove('active'); }, 260); });
  }

  // AABB collision helper
  function aabb(a,b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function resetPlayer(){
    deaths++; deathsEl.textContent = deaths;
    lives = Math.max(0, lives - 1);
    renderLives();
    if (lives <= 0){
      // game over: stop loop and show overlay
  overlayTitle.textContent = 'Save your buddy!  Try again';
      overlay.classList.remove('hidden');
  // visually mark game-wrap as game-over (grayscale)
  try { const gw = document.getElementById('game-wrap'); if (gw) gw.classList.add('game-over'); } catch(e){}
  gameOver = true;
  try{ if (player){ player.vx = 0; player.vy = 0; } } catch(e){}
      if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
      // stop the background loop but keep the audio context alive so the sad melody can play
      // stop the main theme loop fully on Game Over; it'll restart on Play/Play Again
      if (window.__gameAudio && typeof window.__gameAudio.stop === 'function') window.__gameAudio.stop();
      // play a short sad tune using the same audio context (more reliable)
      if (window.__gameAudio && typeof window.__gameAudio.playGameOver === 'function') window.__gameAudio.playGameOver();
      // show restart option (restart button already present)
      return;
    }
    // if still has lives, trigger a short dramatic pause before respawning
    // this gives slow-motion + shake to emphasize the collision
    resetPause = { t: 0, duration: 48, respawnX: player.startX, respawnY: player.startY };
    // clear player input and movement immediately
    keys.left = keys.right = keys.up = false;
    try{ if (player){ player.vx = 0; player.vy = 0; } }catch(e){}
    return;
  }

  // Game loop
  function update(){
    // ease timeScale toward target (for slow-motion effect)
    timeScale += (timeScaleTarget - timeScale) * 0.12;
    // relax camera shake
    cameraShake *= 0.92;
    cameraShakeX += (Math.random()*2-1) * cameraShake * 0.6;
    cameraShakeY += (Math.random()*2-1) * cameraShake * 0.6;
    // if a present sequence is active, run and advance only effects until it completes
    if (presentSequence){
      presentSequence.t = (presentSequence.t||0) + 1;
      // spawn initial explosion at t==1
      if (presentSequence.t === 1){
        const px = present.x + present.w/2;
        const py = present.y + present.h/2;
        // burst particles
        for(let i=0;i<40;i++){
          const ang = Math.random()*Math.PI*2;
          const sp = 2 + Math.random()*3;
          const vx = Math.cos(ang)*sp;
          const vy = Math.sin(ang)*sp - 2;
          effects.push(new Particle(px + (Math.random()-0.5)*20, py + (Math.random()-0.5)*12, vx, vy, ['#ffdf8a','#ffb07a','#ffd36e'][Math.floor(Math.random()*3)]));
        }
    // spawn Astro Steve a little above the present so he can fly out
  const astro = new Astro(px, present.y - 16);
        // compute a vx so astro heads roughly toward the center of the viewport
        const screenCenterX = camera.x + canvas.width/2;
        const dx = screenCenterX - astro.x;
        const travel = 120; // rough distance scale to convert to vx
        astro.vx = dx / travel * 6 + (Math.random()-0.5) * 1.2;
  effects.push(astro);
  // vibrate small pattern on devices that support it
  try{ if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate([30,20,30]); }catch(e){}
  // make Astro shout on launch (chiptune one-shot)
  if (window.__gameAudio && typeof window.__gameAudio.playShout === 'function') window.__gameAudio.playShout();
        // clear player movement
        try{ if (player){ player.vx = 0; player.vy = 0; } }catch(e){}
        // trigger cinematic: slow-motion and camera shake
        timeScaleTarget = 0.24; // slow down
        cameraShake = 12;
        // stop background music but keep context for sound effects
        if (window.__gameAudio && typeof window.__gameAudio.stopBackground === 'function') window.__gameAudio.stopBackground();
        // play explosion / whoosh sounds
        if (window.__gameAudio && typeof window.__gameAudio.playExplosion === 'function') window.__gameAudio.playExplosion();
        if (window.__gameAudio && typeof window.__gameAudio.playWhoosh === 'function') window.__gameAudio.playWhoosh();
      }

      // every few frames spawn extra confetti (a bit richer)
      if (presentSequence.t % 6 === 0){
        const px = present.x + present.w/2;
        const py = present.y + present.h/2;
        for(let i=0;i<10;i++){
          effects.push(new Particle(px + (Math.random()-0.5)*60, py + (Math.random()-0.5)*36, (Math.random()-0.5)*4, -2 - Math.random()*3, ['#8fe0ff','#ffd1f0','#c8ffb3','#ffd36e'][Math.floor(Math.random()*4)]));
        }
      }

      // advance effects
      for(const e of effects) if (typeof e.update === 'function') e.update();
      // remove dead
      for(let i = effects.length - 1; i >= 0; i--){ const en = effects[i]; if (typeof en.alive === 'function' && !en.alive()) effects.splice(i,1); }

      // when sequence completes, show overlay and mark as finished
  if (presentSequence.t > (presentSequence.duration || 200)){
        // restore normal time and shake
        timeScaleTarget = 1.0;
        cameraShake = 0;
  overlayTitle.textContent = 'You FREED ASTRO STEVE! — and he flew home.';
  // update subtitle element if present
  try { const overlaySub = document.getElementById('overlay-sub'); if (overlaySub) overlaySub.textContent = 'To Earth. From Mars. Because he was put in a present by monster cakes.'; } catch(e){}
  overlay.classList.remove('hidden');
  // ensure end-screen timer begins so the starfield will fade in automatically
  try { endScreenStarted = true; endScreenTimer = 0; starfieldActive = false; starfieldAlpha = 0; starfieldStars.length = 0; starfieldSpawnTimer = Math.floor((2 + Math.random() * 3) * 60); } catch(e){}
        try { const gw = document.getElementById('game-wrap'); if (gw) gw.classList.add('game-over'); } catch(e){}
        // keep the page showing the overlay but freeze entities by setting gameOver
        gameOver = true;
        presentSequence = null;
      }

      return; // skip normal entity updates while sequence runs
    }

    // handle reset pause (player hit by cake) cinematic
    if (resetPause){
      resetPause.t = (resetPause.t || 0) + 1;
      // set dramatic slow-motion and shake
      timeScaleTarget = 0.18;
      cameraShake = Math.max(cameraShake, 8);
      // spawn a few small particles once at start
      if (resetPause.t === 1){
        const px = player.x + player.w/2;
        const py = player.y + player.h/2;
        for(let i=0;i<12;i++){
          const ang = Math.random()*Math.PI*2;
          const sp = 1 + Math.random()*2;
          effects.push(new Particle(px + (Math.random()-0.5)*10, py + (Math.random()-0.5)*6, Math.cos(ang)*sp, Math.sin(ang)*sp - 1, ['#ffd36e','#ffb07a','#ffdf8a'][Math.floor(Math.random()*3)]));
        }
        // optional small hit sound
        if (window.__gameAudio && typeof window.__gameAudio.playWhoosh === 'function') window.__gameAudio.playWhoosh();
      }
      // advance effects while paused
      for(const e of effects) if (typeof e.update === 'function') e.update();
      for(let i = effects.length - 1; i >= 0; i--){ const en = effects[i]; if (typeof en.alive === 'function' && !en.alive()) effects.splice(i,1); }
      // when pause complete, respawn player and restore normal time
      if (resetPause.t > resetPause.duration){
        player.reset();
        resetPause = null;
        timeScaleTarget = 1.0;
        cameraShake = 0;
      }
      return; // skip normal updates while resetting
    }

    // advance an end-screen timer if we've shown the win overlay; after ~3 seconds fade to starfield
    if (endScreenStarted){
      endScreenTimer += 1;
      // after ~3 seconds (3s * 60fps) activate starfield fade
      if (!starfieldActive && endScreenTimer > 3 * 60){
        starfieldActive = true;
        // kick off a louder looping theme for the starfield end-screen (if audio available)
        try{ if (window.__gameAudio && typeof window.__gameAudio.startMyHeartLoop === 'function' && !starfieldLoopStarted){ window.__gameAudio.startMyHeartLoop(); starfieldLoopStarted = true; } }catch(e){}
      }
      // once active, ramp up alpha to 1 over ~1.2s
      if (starfieldActive && starfieldAlpha < 1) starfieldAlpha = Math.min(1, starfieldAlpha + 1/72);
      // occasionally spawn an Astro flyby (rough timer with randomness)
      if (starfieldActive){
        starfieldSpawnTimer -= 1;
        if (starfieldSpawnTimer <= 0){
          // spawn an Astro from a random side, heading across the screen
          const startY = Math.random() * (canvas.height * 0.5) + 40;
          const fromLeft = Math.random() > 0.5;
          // occasionally spawn a 'STEVE' flyby (special bubble text)
          const isSteve = Math.random() < 0.28; // ~28% of flybys are Steve
          const astro = new Astro(fromLeft ? -60 : canvas.width + 60, startY, isSteve ? 'STEVE' : null);
          astro.vx = (fromLeft ? 3.5 + Math.random()*2.0 : -3.5 - Math.random()*2.0);
          astro.vy = -2 - Math.random()*2;
          astro.scale = 0.9 + Math.random()*1.1;
          // make the bubble text show a small star or heart if desired
          astro.bubbleAlpha = 0; astro.bubbleOffset = 0;
          effects.push(astro);
          // play a short chiptune approximation of the main phrase of 'My Heart Will Go On' if audio hook exists
          try{ if (window.__gameAudio && typeof window.__gameAudio.playMyHeartHook === 'function') window.__gameAudio.playMyHeartHook(); }catch(e){}
          // reset spawn timer to a random interval (6-14 seconds)
          starfieldSpawnTimer = Math.floor((6 + Math.random()*8) * 60);
        }
      }
    }

    if (gameOver) return; // freeze all entity updates when game is over/won

    // update cakes
    for(const c of cakes) c.update();
    player.update(platforms);

    // cake collisions with player
    for(const c of cakes){
      const cakeBox = { x:c.x, y:c.y, w:c.w, h:c.h };
      const playerBox = { x:player.x, y:player.y, w:player.w, h:player.h };
      if (aabb(cakeBox, playerBox)){
        // any overlap with cake is fatal
        resetPlayer();
        return;
      }
    }

    // present collision
    if (aabb({x:present.x,y:present.y,w:present.w,h:present.h}, {x:player.x,y:player.y,w:player.w,h:player.h})){
      // start present explosion + release sequence
      presentSequence = { t:0, duration: 220 };
      // hide overlay for now until sequence completes
      overlay.classList.add('hidden');
      return;
    }

    // camera follows player
    const margin = canvas.width * 0.3;
    camera.x = Math.max(0, Math.min(player.x + player.w/2 - canvas.width/2, worldWidth - canvas.width));

    // advance effects generally (particles, etc.)
    for(const e of effects) if (typeof e.update === 'function') e.update();
    for(let i = effects.length - 1; i >= 0; i--){ const en = effects[i]; if (typeof en.alive === 'function' && !en.alive()) effects.splice(i,1); }
  }

  function drawGrid(){
    // subtle grid for depth
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.03)'; ctx.lineWidth = 1;
    for(let gx = 0; gx < worldWidth; gx += 120){ ctx.beginPath(); ctx.moveTo(gx - camera.x, 0); ctx.lineTo(gx - camera.x, canvas.height); ctx.stroke(); }
    ctx.restore();
  }

  // Background: mountains and trees with parallax layers
  function drawMountains(parallax){
    // position mountains so their base sits on the horizon (ground top)
    const groundHeight = 60; // should match ground platform height in createLevel
    const baseY = canvas.height - groundHeight - 20; // slight overlap to tuck into horizon
    ctx.save();
    ctx.translate(-camera.x * parallax, 0);
    // a few mountains
    // Marsy mountain tones
    ctx.fillStyle = '#6a1f1f';
    ctx.beginPath(); ctx.moveTo(80, baseY); ctx.lineTo(220, baseY - 140); ctx.lineTo(360, baseY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(420, baseY); ctx.lineTo(640, baseY - 200); ctx.lineTo(860, baseY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(980, baseY); ctx.lineTo(1180, baseY - 120); ctx.lineTo(1380, baseY); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  

  function draw(){
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);

  // sky gradient background (Mars-like atmosphere)
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#ffb3a0');
  g.addColorStop(0.45,'#ff8a66');
  g.addColorStop(1,'#7a3030');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw distant parallaxed layers before foreground (Mars tones)
  drawMountains(0.3);
  drawMountains(0.55);

    // camera transform with shake
    ctx.save();
    const shakeX = (Math.random()*2-1) * cameraShake + cameraShakeX * 0.3;
    const shakeY = (Math.random()*2-1) * cameraShake + cameraShakeY * 0.3;
    ctx.translate(-camera.x + shakeX, shakeY);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, canvas.height - 60, worldWidth, 60);

    // platforms
    for(const p of platforms){ p.draw(ctx); }

    // present (at end)
    present.draw(ctx);

    // cakes
    for(const c of cakes){ c.draw(ctx); }

    // player
    player.draw(ctx);

  // effects (particles, astro)
  for(const e of effects){ if (typeof e.draw === 'function') e.draw(ctx); }

    // draw horizon fog over the ground to blend mountains
    ctx.restore();
    // fog is drawn in screen space (not parallaxed)
    ctx.save();
    const fogTop = canvas.height - 120;
    const fog = ctx.createLinearGradient(0, fogTop, 0, canvas.height);
    fog.addColorStop(0, 'rgba(255,210,180,0.0)');
    fog.addColorStop(0.25, 'rgba(255,200,170,0.06)');
    fog.addColorStop(1, 'rgba(120,40,40,0.28)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, fogTop, canvas.width, canvas.height - fogTop);
    ctx.restore();
    // starfield fade-in overlay (end-screen)
    if (starfieldAlpha > 0){
      // generate some stars on first activation
      if (starfieldStars.length === 0){
        const count = Math.floor(80 + Math.random()*60);
        for(let i=0;i<count;i++) starfieldStars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.9, size: Math.random()*2 + 0.5, tw: Math.random()*0.06 + 0.01 });
      }
      ctx.save();
      ctx.globalAlpha = starfieldAlpha;
      // darken scene slightly toward a starry sky
      ctx.fillStyle = 'rgba(6,8,18,0.9)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      // draw stars
      for(const s of starfieldStars){
        const flick = 0.5 + Math.sin(Date.now()*0.002 * (s.tw*100 + 1)) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.6 * flick})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.restore();
    }
  }

  // main loop using RAF
  function loop(){
  // debug: indicate loop running (will be quiet in normal use)
  if (typeof console !== 'undefined' && !window.__gameLoopStarted) { console.log('game loop started'); window.__gameLoopStarted = true; }
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // Restart handler
  restartBtn.addEventListener('click', () => { createLevel(); startGame(); });

  // expose a quick restart on double-click canvas
  canvas.addEventListener('dblclick', ()=> { createLevel(); startGame(); });

  // do NOT auto-start loop here — show splash until user presses Play
  createLevel();

  // startGame starts the RAF loop and (optionally) the music
  function startGame(){
    try {
      const splash = document.getElementById('splash'); if (splash) splash.classList.add('hidden');
      overlay.classList.add('hidden');
      try { const gw = document.getElementById('game-wrap'); if (gw) gw.classList.remove('game-over'); } catch(e){}
      // visual feedback for user: update play button text if present
      const pb = document.getElementById('play-btn'); if (pb) pb.textContent = 'Starting...';
      if (typeof console !== 'undefined') console.log('startGame() called');
      // ensure canvas sizing is current and recreate level geometry
      if (typeof resize === 'function') resize();
      createLevel();
      // if coming from an end-screen, ensure starfield and its loop are stopped/reset
      try{
        if (starfieldActive || endScreenStarted){
          starfieldActive = false; starfieldAlpha = 0; starfieldStars.length = 0; starfieldSpawnTimer = 0; endScreenStarted = false; endScreenTimer = 0; starfieldLoopStarted = false;
        }
        if (window.__gameAudio && typeof window.__gameAudio.stopMyHeartLoop === 'function') window.__gameAudio.stopMyHeartLoop();
      }catch(e){}
    // show touch UI only on touch devices
    try{ if ('ontouchstart' in window || navigator.maxTouchPoints > 0) setupTouchControls(); }catch(e){}
    // clear input state so keys held previously don't persist
    keys.left = keys.right = keys.up = false;
    try{ if (player){ player.vx = 0; player.vy = 0; } }catch(e){}
      // start audio if available
      if (window.__gameAudio && typeof window.__gameAudio.start === 'function') window.__gameAudio.start();
  // clear gameOver flag and ensure RAF loop is running
  gameOver = false;
  if (!rafId) rafId = requestAnimationFrame(loop);
      // clear the temporary play text after a moment
      if (pb) setTimeout(()=> { try{ pb.textContent = 'Playing...'; }catch(e){} }, 600);
    } catch (err) {
      console.error('startGame error', err);
      // show a small error message in the splash area so it's visible
      const splash = document.getElementById('splash');
      if (splash){
        splash.classList.remove('hidden');
        const inner = splash.querySelector('#splash-inner');
        if (inner){
          const msg = document.createElement('div');
          msg.style.marginTop = '12px'; msg.style.color = 'crimson'; msg.style.fontWeight = '700';
          msg.textContent = 'Error starting game — check console for details.';
          inner.appendChild(msg);
        }
      }
    }
  }

  // expose startGame to global so Play button can call it
  window.startGame = startGame;

})();

// --- richer chiptune synth (lead, bass, arpeggio, hi-hat) ---
(function(){
  // expose audio controls via window.__gameAudio
  const playBtn = document.getElementById('play-btn');
  let ctx = null;
  let masterGain = null;
  let isPlaying = false;
  let loopTimer = null;
  // keep track of scheduled audio nodes so we can stop them when needed
  let activeNodes = new Set();

  function trackNode(n){
    try{
      if (!n) return;
      activeNodes.add(n);
      const cleanup = ()=>{ try{ activeNodes.delete(n); }catch(e){} };
      if (typeof n.onended !== 'undefined') n.onended = cleanup;
      else setTimeout(cleanup, 3000);
    }catch(e){}
  }

  function clearScheduledNodes(){
    for(const n of Array.from(activeNodes)){
      try{ if (typeof n.stop === 'function') n.stop(); }catch(e){}
      try{ if (typeof n.disconnect === 'function') n.disconnect(); }catch(e){}
    }
    activeNodes.clear();
  }

  const tempo = 130; // slightly brisk and playful
  const beatSec = 60 / tempo;

  // patterns (durations in beats)
  // longer lead phrase for variety (16-step-ish)
  const leadPattern = [
    {n: 'A4', d: 1}, {n: 'C5', d: 0.5}, {n: 'E5', d: 0.5}, {n: 'A5', d: 1},
    {n: 'G5', d: 0.5}, {n: 'E5', d: 0.5}, {n: 'C5', d: 1}, {n: 'A4', d: 1},
    {n: 'F4', d: 1}, {n: 'E4', d: 1}, {n: 'D4', d: 1}, {n: 'C4', d: 1},
    {n: 'A3', d: 0.5}, {n: 'C4', d: 0.5}, {n: 'E4', d: 1}, {n: 'A4', d: 1}
  ];
  const bassPattern = [
    {n:'A2', d:2}, {n:'A2', d:2}, {n:'E2', d:2}, {n:'E2', d:2}
  ];
  const arpPattern = [
    {n:'A5', d:0.5}, {n:'C6', d:0.5}, {n:'E6', d:0.5}, {n:'A6', d:0.5}
  ];
  const hatPattern = [1,0,1,0,1,0,1,0]; // play on/off per 1/8 note

  // utility: note name -> frequency
  function noteFreq(name){
    if (!name) return 0;
    const notes = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
    const m = name.match(/^([A-G]#?b?)(\d+)$/);
    if (!m) return 0;
    const p = notes[m[1]];
    const octave = parseInt(m[2],10);
    const semis = (octave - 4) * 12 + (p - 9); // A4 = 440 as reference
    return 440 * Math.pow(2, semis/12);
  }

  function startAudio(){
    if (isPlaying) return;
    // create audio context if needed
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // resume if suspended (user gesture may have created it earlier)
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') { ctx.resume(); }
    if (!masterGain){ masterGain = ctx.createGain(); masterGain.gain.value = 0.18; masterGain.connect(ctx.destination); }
    isPlaying = true;
    scheduleLoop();
    if (playBtn) { playBtn.textContent = 'Playing...'; }
  }

  function stopAudio(){
    if (!isPlaying) return;
    isPlaying = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    // stop any scheduled nodes so loops don't keep playing
    clearScheduledNodes();
    // stop any starfield loop if running
    try{ if (window.__gameAudio && typeof window.__gameAudio.stopMyHeartLoop === 'function') window.__gameAudio.stopMyHeartLoop(); }catch(e){}
    // do not close the audio context here; keep it around so short one-off sounds can play reliably
    if (playBtn) { playBtn.textContent = 'Play'; }
  }

  // stop background scheduling but keep audio context alive
  function stopBackground(){
    if (!isPlaying && !loopTimer) return;
    isPlaying = false;
    if (loopTimer){ clearTimeout(loopTimer); loopTimer = null; }
    // stop scheduled nodes for background loop but keep context open for one-shots
    clearScheduledNodes();
    // also stop louder starfield motif if active
    try{ if (window.__gameAudio && typeof window.__gameAudio.stopMyHeartLoop === 'function') window.__gameAudio.stopMyHeartLoop(); }catch(e){}
    if (playBtn) { playBtn.textContent = 'Play'; }
  }

  // one-shot explosion sound
  function playExplosion(){
    try{
      if (!ctx) return;
      const now = ctx.currentTime + 0.02;
      // burst of filtered noise
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.exp(-i / (ctx.sampleRate * 0.08));
      const src = ctx.createBufferSource(); src.buffer = buf;
  trackNode(src);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(0.6, now + 0.01); g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      src.connect(g); g.connect(bp); bp.connect(masterGain);
      src.start(now); src.stop(now + 0.28);
      // low thump
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(80, now);
  trackNode(o);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.001, now); og.gain.linearRampToValueAtTime(0.5, now + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.connect(og); og.connect(masterGain); o.start(now); o.stop(now + 0.6);
    }catch(e){ console.warn('explosion sound failed', e); }
  }

  // whoosh/launch sound for Astro
  function playWhoosh(){
    try{
      if (!ctx) return;
      const now = ctx.currentTime + 0.02;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(400, now);
  trackNode(o);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(0.18, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 1800;
      o.connect(g); g.connect(lp); lp.connect(masterGain);
      // pitch sweep up
      o.frequency.linearRampToValueAtTime(1200, now + 0.6);
      o.start(now); o.stop(now + 0.9);
    }catch(e){ console.warn('whoosh failed', e); }
  }

  // short chiptune shout for Astro (WAHOOOO) - a quick arpeggio + pitch slide
  function playShout(){
    try{
      if (!ctx) return;
      const now = ctx.currentTime + 0.02;
      // FM-style chirp: carrier + modulating oscillator
      const carrier = ctx.createOscillator(); carrier.type = 'square';
      const mod = ctx.createOscillator(); mod.type = 'sine';
      const modGain = ctx.createGain(); modGain.gain.value = 0;
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
      carrier.connect(g); g.connect(masterGain);
      // FM sweep
      mod.frequency.setValueAtTime(6, now); mod.start(now); mod.stop(now + 0.9); trackNode(mod);
      carrier.frequency.setValueAtTime(noteFreq('C5'), now);
      // ramp modulation depth and carrier pitch slightly for chirp character
      modGain.gain.setValueAtTime(0, now); modGain.gain.linearRampToValueAtTime(80, now + 0.06); modGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      carrier.frequency.exponentialRampToValueAtTime(noteFreq('C6') * 1.5, now + 0.5);
      g.gain.linearRampToValueAtTime(0.28, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      carrier.start(now); carrier.stop(now + 1.0); trackNode(carrier);

      // extra arpeggio over the chirp for melody
      const notes = ['C5','E5','G5','C6','E6'];
      let t = now + 0.08;
      for(let i=0;i<notes.length;i++){
        const o = ctx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(noteFreq(notes[i]), t);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.12, t+0.005); og.gain.exponentialRampToValueAtTime(0.0001, t+0.26);
        o.connect(og); og.connect(masterGain);
        o.start(t); o.stop(t + 0.26);
        trackNode(o);
        t += 0.12;
      }
    }catch(e){ console.warn('playShout failed', e); }
  }

  // short chiptune approximation of the main hook from 'My Heart Will Go On' (brief, respectful, NOT the original recording)
  function playMyHeartHook(){
    try{
      if (!ctx) return;
      const now = ctx.currentTime + 0.02;
      // simple sequence of 4 short notes to suggest the motif
      const notes = ['E5','G5','A5','G5'];
      let t = now;
      for(let i=0;i<notes.length;i++){
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(noteFreq(notes[i]), t);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+0.28);
        o.connect(g); g.connect(masterGain);
        o.start(t); o.stop(t + 0.28);
        trackNode(o);
        t += 0.28;
      }
    }catch(e){ console.warn('playMyHeartHook failed', e); }
  }

  // lead voice: bright square with slight pulse-width via detune
  function playLead(time, note, dur){
    if (!ctx || !note) return;
    const freq = noteFreq(note);
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.setValueAtTime(freq, time);
    // slight detune LFO for warmth
    const det = ctx.createOscillator(); det.type='sine'; det.frequency.value = 5;
    const detGain = ctx.createGain(); detGain.gain.value = 3; det.connect(detGain); detGain.connect(osc.frequency);
    det.start(time); det.stop(time + dur * beatSec + 0.02);
  trackNode(det);
  trackNode(osc);

    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.16, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, time + dur * beatSec);

    // bright high shelf
    const hp = ctx.createBiquadFilter(); hp.type='highshelf'; hp.frequency.value = 1200; hp.gain.value = 6;

    osc.connect(g); g.connect(hp); hp.connect(masterGain);
    osc.start(time); osc.stop(time + dur * beatSec + 0.03);
  }

  // bass voice: square-ish with lowpass
  function playBass(time, note, dur){
    if (!ctx || !note) return;
    const freq = noteFreq(note);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, time);
  trackNode(osc);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.22, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur * beatSec);
    const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 800;
    osc.connect(g); g.connect(lp); lp.connect(masterGain);
    osc.start(time); osc.stop(time + dur * beatSec + 0.02);
  }

  // arpeggio (light pluck)
  function playArp(time, note, dur){
    if (!ctx || !note) return;
    const freq = noteFreq(note);
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, time);
  trackNode(osc);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.12, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur * beatSec);
    const filt = ctx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value = Math.min(2200, freq*2);
    osc.connect(g); g.connect(filt); filt.connect(masterGain);
    osc.start(time); osc.stop(time + dur * beatSec + 0.02);
  }

  // hi-hat: noise burst through bandpass
  function playHat(time, dur){
    if (!ctx) return;
    // create short noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.exp(-i / (ctx.sampleRate * 0.02));
    const src = ctx.createBufferSource(); src.buffer = buf;
  trackNode(src);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(0.12, time + 0.005); g.gain.exponentialRampToValueAtTime(0.001, time + dur * beatSec);
    const bp = ctx.createBiquadFilter(); bp.type='highpass'; bp.frequency.value = 4000;
    src.connect(g); g.connect(bp); bp.connect(masterGain);
  src.start(time); src.stop(time + 0.02);
  trackNode(src);
  }

  function scheduleLoop(){
    if (!ctx) return;
    const start = ctx.currentTime + 0.06;
    let t = start;

    // compute loop duration: use lead pattern total
    const loopDur = leadPattern.reduce((s,p)=>s + p.d * beatSec, 0);

    // schedule lead
    for(const step of leadPattern){
      if (step.n) playLead(t, step.n, step.d);
      t += step.d * beatSec;
    }

    // schedule bass across loop
    t = start;
    for(const step of bassPattern){ playBass(t, step.n, step.d); t += step.d * beatSec; }

    // schedule arpeggio as repeated fast notes
    t = start;
    const arpRepeat = Math.floor(loopDur / (arpPattern.reduce((s,p)=>s + p.d * beatSec,0)));
    for(let r=0;r<arpRepeat;r++){
      for(const a of arpPattern){ playArp(t, a.n, a.d); t += a.d * beatSec; }
    }

    // schedule hats on 1/8 notes
    t = start;
    const eight = beatSec * 0.5;
    const hatCount = Math.floor(loopDur / eight);
    for(let i=0;i<hatCount;i++){
      if (hatPattern[i % hatPattern.length]) playHat(t, 0.5);
      t += eight;
    }

    // set up timer to schedule next loop slightly before end
    loopTimer = setTimeout(()=>{ if (isPlaying) scheduleLoop(); }, loopDur * 1000 - 30);
  }

  // attach to global so the game can start audio when user presses Play
  // small sad melody for game over
  function playGameOver(){
    try{
      // use existing ctx/masterGain when possible
      const octx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ownMaster = (!masterGain || octx !== ctx);
      const master = ownMaster ? (octx.createGain()) : masterGain;
      if (ownMaster){ master.gain.value = 0.16; master.connect(octx.destination); }
      const now = octx.currentTime + 0.05;
      const notes = ['A4','F4','D4','C4'];
      let t = now;
      for(let i=0;i<notes.length;i++){
        const f = noteFreq(notes[i]);
        const o = octx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(f, t);
        const g = octx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+1.4);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t+1.4);
        try{ trackNode(o); }catch(e){}
        t += 1.2;
      }
      // if we created a one-off master connect, clean it up after a timeout
      if (ownMaster){ setTimeout(()=>{ try{ master.disconnect(); }catch(e){} }, 2800); }
    }catch(e){ console.warn('game over tune failed', e); }
  }

  // louder looping motif for the starfield: approximate, short loop that can be started/stopped
  let myHeartLoop = { running: false, nodes: [], loopGain: null, interval: null };
  function startMyHeartLoop(){
    try{
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (myHeartLoop.running) return;
      // create a dedicated gain for the loop at a slightly higher level
  if (!myHeartLoop.loopGain){ myHeartLoop.loopGain = ctx.createGain(); myHeartLoop.loopGain.gain.value = 0.6; myHeartLoop.loopGain.connect(ctx.destination); }
      const baseTime = ctx.currentTime + 0.02;
      // schedule a repeating short phrase using a small interval timer
      myHeartLoop.interval = setInterval(()=>{
        const now = ctx.currentTime + 0.02;
        const notes = ['E4','G4','A4','G4','E4','D4']; // simple motif
        let t = now;
        for(const n of notes){
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(noteFreq(n), t);
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
          o.connect(g); g.connect(myHeartLoop.loopGain);
          o.start(t); o.stop(t + 0.38);
          trackNode(o);
          t += 0.38;
        }
      }, 1200); // repeat roughly every 1.2s
      myHeartLoop.running = true;
    }catch(e){ console.warn('startMyHeartLoop failed', e); }
  }
  function stopMyHeartLoop(){
    try{
      if (myHeartLoop.interval) { clearInterval(myHeartLoop.interval); myHeartLoop.interval = null; }
      myHeartLoop.running = false;
    }catch(e){ console.warn('stopMyHeartLoop failed', e); }
  }

  window.__gameAudio = { start: startAudio, stop: stopAudio, stopBackground: stopBackground, playGameOver, playExplosion, playWhoosh, playShout, playMyHeartHook, startMyHeartLoop, stopMyHeartLoop };
  document.addEventListener('visibilitychange', ()=>{ if (document.hidden) stopAudio(); });

  // if there is a play button on the splash, wire it to start game and audio
  if (playBtn){ playBtn.addEventListener('click', ()=>{ if (window.startGame) window.startGame(); else { startAudio(); } }); }

})();