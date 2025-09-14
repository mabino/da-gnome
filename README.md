Da Gnome Pal on Mars

This is a tiny, self-contained HTML5 platformer you can run locally. A gnome must avoid moving birthday cakes with candles and reach the present at the far right of the level. The game now has a splash screen titled "Da Gnome Pal on Mars" — press Play to start the game and automatically start the chiptune soundtrack.

Files created:
- index.html — main page to open in a browser
- styles.css — styling and HUD/overlay
- game.js — game logic (physics, rendering, level)

How to run:
1. Open `index.html` in your browser (double-click or use "Open File...").
2. Use arrow keys ← → (or A / D) to move and Space to jump.

Run with live-reload (recommended for development):
1. Install dependencies once:

```bash
cd /Users/mabino/Downloads/bdaybattle
npm install
```

2. Start the dev server with live reload:

```bash
npm start
# then open http://localhost:3000 in your browser
```

Note: I installed the dev dependency `browser-sync` during setup; `npm install` reported some audit findings (a few vulnerabilities) which you can inspect with `npm audit` and fix with `npm audit fix` if desired.

Notes and possible improvements:
- Add sprites, animations, and sound effects.
- Add more levels, a main menu, and score/time tracking.
- Tweak physics and cake patterns for more challenge.

Enjoy!