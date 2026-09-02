# Da Gnome Pal on Mars — 2026 Edition

A high-fidelity HTML5 Canvas sidescroller platformer featuring dynamic 2D lighting, multi-layer parallax Mars landscapes, particle physics, expressive vector character animations, and a rich Web Audio API chiptune synthesizer.

You play as Da Gnome Pal, navigating the rugged Martian regolith and antigravity platforms to rescue your trapped buddy, Astro Steve, from the clutches of sentient monster cosmic cakes!

## Features

- **2D Dynamic Lighting & Bloom Engine**: Real-time point lights for flickering candle flames, rocket thrusters, glowing underground crystal geodes, and explosive celebratory beacons.
- **Multi-Layer Parallax Environment**:
  - Distant cosmic sky with twinkling starfield, nebulae, shooting stars, Phobos & Deimos moons, the Sun with lens flare, and the distant pale blue dot of Earth.
  - Layered Martian mountain ranges (Olympus Mons) and canyon mesas with rim lighting.
  - Sci-fi Mars colony outpost silhouettes with habitat domes, solar arrays, and pulsing communication tower beacons.
- **Enhanced Character Animation & Physics**:
  - Squash and stretch on jumps and landings.
  - Dynamic hat sway physics and fluttering locks in the white beard.
  - Expressive animated eyes with blinking and direction tracking.
  - High-tech double-jump with mid-air somersault, cyan shockwave ring, and heel thrusters.
  - Martian regolith dust particles emitted on running and skidding.
- **Murderous Monster Cosmic Cakes**:
  - Multi-tier textured sponges with dripping neon alien jam fillings.
  - Menacing snapping maws with razor fangs and tracking eyes.
  - Multiple distinct cake variants (Strawberry Terror, Dark Chocolate Doom, Radioactive Neon Berry).
- **Astro Steve & The Containment Present**:
  - Holographic gift box with glowing energy ribbons and beacon beam.
  - Cinematic slow-motion liberation with confetti ribbons, golden stars, and fireworks.
  - Astro Steve with reflective gold visor, twin rocket thrusters, and custom celebratory speech balloons.
- **Modern 2026 Glassmorphic UI & HUD**:
  - Live Mars distance progress tracker with moving gnome pin.
  - Animated life-support helmet pods.
  - Mission completion debriefing screen with performance statistics (mission time, jumps logged, deaths).
  - Sound toggle with mute controls and touch support for mobile and tablets.

## Controls

- **Move Left / Right**: `A` / `D` or `◀` / `▶`
- **Jump / Double Jump**: `Space` / `W` / `▲`
- **Instant Restart**: `R` (on Game Over or Victory screens)
- **Touch / Mobile**: On-screen directional buttons and jump pad

## Running the Game

### Option 1: Direct Browser
Open `index.html` in any modern web browser.

### Option 2: Live Development Server
```bash
npm install
npm start
```
Then visit `http://localhost:3000`.

### Option 3: Docker / Container
```bash
docker compose up game
```
Then open `http://localhost:3000`.

## Testing

Run the automated unit and integration test suite:

```bash
npm test
```

Or run tests in a container:

```bash
docker compose run test
```
