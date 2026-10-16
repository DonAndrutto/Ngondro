const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const server = require('./server.cjs').createServer();

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.EWAM_BROWSER_PATH ? {executablePath:process.env.EWAM_BROWSER_PATH} : {});
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', {name:'Enter — Kunzang Gongdu Ngöndro',exact:true}).click();
    await page.getByRole('button', {name:'Proceed to the Text',exact:true}).click();

    async function beginPlayback() {
      await page.evaluate(() => {
        stopAutoScroll();
        cancelPark();
        window.scrollTo(0, 1000);
        state.scrollSpeed = 10;
        startAutoScroll();
        // Isolate fullscreen from the deliberate pauses at repeated passages.
        refrainGeometry().forEach(group => refrainVisited.add(group.id));
      });
    }

    async function expectContinuousPlayback(label) {
      const result = await page.evaluate(() => new Promise(resolve => {
        const anchor = captureReadingAnchor();
        const top = () => (anchor.range || anchor.block).getBoundingClientRect().top;
        const started = performance.now();
        const initialTop = top();
        let earlyTravel = null;
        function sample(now) {
          const elapsed = now - started;
          const travel = initialTop - top();
          if (earlyTravel === null && elapsed >= 300) earlyTravel = travel;
          if (elapsed >= 700) {
            resolve({earlyTravel,travel,playing:isAutoScrolling,parked:!!parkedBlock});
          } else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      }));
      assert.equal(result.playing, true, label + ': playback stays on');
      assert.ok(result.earlyTravel > 30, label + ': text must move immediately: ' + JSON.stringify(result));
      assert.ok(result.travel > 100, label + ': text keeps moving: ' + JSON.stringify(result));
      assert.equal(result.parked, false, label + ': position correction settles without its timeout');
    }

    await beginPlayback();
    await page.locator('#btnFS').click();
    await expectContinuousPlayback('enter fullscreen');
    await page.locator('#btnFS').click();
    await expectContinuousPlayback('exit fullscreen button');

    await page.locator('#btnFS').click();
    await expectContinuousPlayback('re-enter fullscreen');
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !isFullScreen);
    await expectContinuousPlayback('native fullscreen exit (Escape path)');

    // The layout-only fallback must work when the native API is unavailable.
    await page.evaluate(() => {document.documentElement.requestFullscreen = undefined;});
    await page.locator('#btnFS').click();
    await expectContinuousPlayback('enter layout-only fullscreen');
    await page.locator('#btnFS').click();
    await expectContinuousPlayback('exit layout-only fullscreen');
    await page.evaluate(() => stopAutoScroll());
    assert.deepEqual(errors, []);
    console.log('PASS: uninterrupted auto-play on fullscreen entry, button/native exit, and layout-only fallback.');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => {console.error(error);server.close();process.exitCode = 1;});
