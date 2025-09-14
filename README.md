# Da Gnome Pal on Mars

You're a tiny gnome that must avoid murderous birthday cakes on Mars!  Reach the present are free your buddy, who is trapped and far from home.

Files:
- index.html — main page to open in a browser
- styles.css — styling and HUD/overlay
- game.js — game logic (physics, rendering, level)

How to run:
1. Open `index.html` in your browser (double-click or use "Open File...").
2. Use arrow keys ← → (or A / D) to move and Space to jump.

Run with live-reload (recommended for development):
1. Install dependencies once:

```bash
npm install
```

2. Start the dev server with live reload:

```bash
npm start
# then open http://localhost:3000 in your browser
```

Note: Address any vulnerabilities by running `npm audit fix`.

Notes and possible improvements:
- Add sprites, animations, and sound effects.
- Add more levels, a main menu, and score/time tracking.
- Tweak physics and cake patterns for more challenge.
