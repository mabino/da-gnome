import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

test('End-to-End Browser Runtime Gate', async (t) => {
  let server;
  let port;
  let browser;

  // Spin up local static server
  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.resolve('.' + reqPath);
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png'
      };

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  browser = await chromium.launch({ headless: true });

  await t.test('loads page without any syntax or runtime errors and starts gameplay', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/index.html`);

    // Verify startGame is exposed to window
    const hasStartGame = await page.evaluate(() => typeof window.startGame === 'function');
    assert.strictEqual(hasStartGame, true, 'window.startGame must be a function on page load');

    // Click Launch Mission button
    await page.click('#play-btn');

    // Verify splash screen disappears
    await page.waitForSelector('#splash.hidden', { state: 'attached', timeout: 5000 });

    // Simulate player controls
    await page.keyboard.press('KeyD', { delay: 100 });
    await page.keyboard.press('Space', { delay: 100 });

    // Allow game loop to render multiple frames
    await page.waitForTimeout(1000);

    // Assert zero uncaught JavaScript errors or console errors
    assert.deepStrictEqual(pageErrors, [], `Page threw runtime errors: ${pageErrors.join(', ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Console logged errors: ${consoleErrors.join(', ')}`);

    await context.close();
  });

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});
