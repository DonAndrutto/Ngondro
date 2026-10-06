const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {createServer} = require('./server.cjs');
const server = process.env.READER_URL ? null : createServer();

async function main() {
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.EWAM_BROWSER_PATH ? {executablePath:process.env.EWAM_BROWSER_PATH} : {});
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settled = () => page.waitForFunction(() => parkFrame === 0 && pageLayoutFrame === 0);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {type,
    touchPoints:points.map(([x,y,id]) => ({x,y,id,radiusX:3,radiusY:3,force:1}))});
  async function touchListeners() {
    const {result} = await cdp.send('Runtime.evaluate', {expression:'document.getElementById("contentArea")'});
    const {listeners} = await cdp.send('DOMDebugger.getEventListeners', {objectId:result.objectId});
    return listeners.filter(listener => listener.type.startsWith('touch')).map(listener => ({type:listener.type,passive:listener.passive}));
  }
  async function swipe(from, to, cancel = false) {
    await send('touchStart', [[...from,1]]);
    for (let step=1; step<=5; step++) {
      await send('touchMove', [[from[0]+(to[0]-from[0])*step/5, from[1]+(to[1]-from[1])*step/5, 1]]);
    }
    await send(cancel ? 'touchCancel' : 'touchEnd', []);
    await settled();
  }
  async function pinch(initial, final, sequential = false, cancel = false) {
    const initialPoints = [[195-initial/2,350,1],[195+initial/2,350,2]];
    const finalPoints = [[195-final/2,350,1],[195+final/2,350,2]];
    await send('touchStart', initialPoints.slice(0,1));
    await send('touchStart', initialPoints);
    for (let step=1; step<=5; step++) {
      const gap=initial+(final-initial)*step/5;
      await send('touchMove', [[195-gap/2,350,1],[195+gap/2,350,2]]);
    }
    if (cancel) await send('touchCancel', []);
    else {
      if (sequential) {
        await send('touchEnd', finalPoints.slice(1));
        await send('touchMove', [[320,350,2]]);
      }
      await send('touchEnd', []);
    }
    await settled();
  }
  const position = () => page.evaluate(() => ({section:readingPage.section,index:readingPage.index}));
  try {
    await page.goto(process.env.READER_URL || 'http://127.0.0.1:'+server.address().port+'/Ngondro/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => typeof pageInputBlocked === 'function');
    await page.getByRole('button',{name:'Enter — Kunzang Gongdu Ngöndro',exact:true}).click();
    await page.locator('#welcomeCard').getByRole('button',{name:'Proceed to the Text',exact:true}).click();
    await settled();
    assert.deepEqual(await touchListeners(),[],'scroll mode has no custom touch handlers on arrival');
    await page.locator('#btnPage').click();
    assert.equal((await touchListeners()).filter(listener => !listener.passive).length,3,'page mode installs touch handlers once');
    await page.evaluate(() => {readingPage.section=2; readingPage.index=0; layoutReadingPage();});
    await swipe([320,250],[70,250]);
    assert.deepEqual(await position(), {section:2,index:1}, 'left swipe advances once');
    await swipe([70,250],[320,250]);
    assert.deepEqual(await position(), {section:2,index:0}, 'right swipe goes back once');
    await swipe([190,250],[160,250]);
    assert.deepEqual(await position(), {section:2,index:0}, 'short drag is not a page turn');
    await swipe([190,250],[190,450]);
    assert.deepEqual(await position(), {section:2,index:0}, 'vertical gesture is not a page turn');
    await swipe([320,250],[70,250],true);
    assert.deepEqual(await position(), {section:2,index:0}, 'cancelled swipe is ignored');

    // Native touch taps still use the existing edge controls.
    await page.waitForTimeout(750);
    await page.touchscreen.tap(370,250);
    assert.deepEqual(await position(), {section:2,index:1});
    await page.evaluate(() => {window.gestureAnchor = captureReadingAnchor();});
    await pinch(160,90,true);
    assert.equal(await page.evaluate(() => state.fontSize),15,'one pinch, one unit');
    const anchorVisible = () => page.evaluate(() => {
      const rect=gestureAnchor.range.getBoundingClientRect();
      const area=document.getElementById('contentArea').getBoundingClientRect();
      return rect.right > area.left && rect.left < area.right && rect.bottom > area.top && rect.top < area.bottom;
    });
    assert.equal(await anchorVisible(),true,'pinch retains the reading character');
    await page.evaluate(() => {window.gestureAnchor = captureReadingAnchor();});
    await pinch(90,200);
    assert.equal(await page.evaluate(() => state.fontSize),16,'one spread, one unit');
    assert.equal(await anchorVisible(),true,'spread retains the reading character');
    await pinch(160,155);
    assert.equal(await page.evaluate(() => state.fontSize),16,'finger jitter does not resize');
    await pinch(160,80,false,true);
    assert.equal(await page.evaluate(() => state.fontSize),16,'cancelled pinch does not resize');

    // Existing source selection and overlays take precedence over gestures.
    await page.evaluate(() => {
      const root=readingPage.anchor.block.querySelector('.tib');
      const range=document.createRange(); range.selectNodeContents(root);
      getSelection().removeAllRanges();getSelection().addRange(range);
    });
    const beforeSelection=await position();
    await swipe([320,250],[70,250]);
    assert.deepEqual(await position(),beforeSelection,'selected text is not paged by dragging');
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.locator('[data-tab="INDEX"]').click();
    const beforeIndex=await position();
    await swipe([320,700],[70,700]);
    assert.deepEqual(await position(),beforeIndex,'index/backdrop touches do not turn pages');
    await page.evaluate(() => closeIndex());

    // Fullscreen page gestures and passage boundaries use the same route.
    await page.evaluate(() => {readingPage.index=readingPage.count-1;showReadingPage();});
    await swipe([320,250],[70,250]);
    assert.deepEqual(await position(),{section:3,index:0},'swipe crosses to the next text');
    await swipe([70,250],[320,250]);
    assert.equal((await position()).section,2,'swipe crosses back to the previous text');
    await page.evaluate(() => {isFullScreen=true;document.body.classList.add('fullscreen');updateFSIcon();layoutReadingPage();});
    const fullscreenBefore=await position();
    await swipe([320,150],[70,150]);
    assert.notDeepEqual(await position(),fullscreenBefore,'fullscreen swipe');
    await page.evaluate(() => {isFullScreen=false;document.body.classList.remove('fullscreen');updateFSIcon();layoutReadingPage();});
    await page.locator('#btnPage').click();
    assert.deepEqual(await touchListeners(),[],'switching to scroll mode removes all custom touch handlers');
    await page.evaluate(() => window.scrollTo(0,0));
    await swipe([190,600],[190,250]);
    await page.waitForFunction(() => scrollY > 50);
    assert.equal(await page.evaluate(() => state.readingMode),'scroll','native vertical scrolling remains');
    await pinch(160,90);
    assert.equal(await page.evaluate(() => state.fontSize),16,'scroll-mode pinch does not resize');
    await pinch(90,160);
    assert.equal(await page.evaluate(() => state.fontSize),16,'scroll-mode spread does not resize');

    // Repeated mode changes must not accumulate blocking handlers.
    for (let i=0;i<3;i++) {
      await page.locator('#btnPage').click();
      assert.equal((await touchListeners()).filter(listener => !listener.passive).length,3);
      await page.locator('#btnPage').click();
      assert.deepEqual(await touchListeners(),[]);
    }
    await page.locator('#btnPage').click();

    // Bounds and persistence use the normal sizing path in each collection.
    await page.evaluate(() => {state.fontSize=12;applyFontSize();});
    await pinch(160,90);
    assert.equal(await page.evaluate(() => state.fontSize),12);
    await page.evaluate(() => {state.fontSize=40;applyFontSize();});
    await pinch(90,160);
    assert.equal(await page.evaluate(() => state.fontSize),40);
    await page.evaluate(() => {state.fontSize=16;applyFontSize();switchTab('NGONDRO');setLanguage('pl');});
    await settled();
    await pinch(90,160);
    assert.equal(await page.evaluate(() => state.fontSize),17,'Polish Ngondro uses the shared gestures');
    await page.reload();await settled();
    await page.locator('#ykLoader').click();
    await page.locator('#welcomeCard button[onclick="closeWelcome()"]').click();
    assert.equal(await page.evaluate(() => state.fontSize),17,'gesture size persists');
    assert.equal(await page.evaluate(() => state.lang),'pl','language persists');
    assert.equal(await page.evaluate(() => state.activeTab),'NGONDRO','practice tab persists');
    assert.equal((await touchListeners()).filter(listener => !listener.passive).length,3);
    await page.evaluate(() => {readingPage.section=2;readingPage.index=0;layoutReadingPage();});
    await swipe([320,250],[70,250]);assert.equal(await page.evaluate(() => readingPage.index),1,'Ngondro swipe');
    await pinch(160,90);assert.equal(await page.evaluate(() => state.fontSize),16,'Ngondro pinch');
    await page.evaluate(() => {openTimerDialog();});
    const timerPosition=await position();
    await swipe([320,700],[70,700]);assert.deepEqual(await position(),timerPosition,'timer dialog blocks swipes');
    await page.evaluate(() => closeTimerDialog());
    await page.evaluate(() => {openGarland();});
    const visualPosition=await position();
    await swipe([320,700],[70,700]);assert.deepEqual(await position(),visualPosition,'visualization blocks swipes');
    await page.evaluate(() => closeGarland());
    await page.locator('#btnPage').click();assert.deepEqual(await touchListeners(),[],'Ngondro scroll mode removes handlers');
    assert.deepEqual(errors,[]);
    console.log('PASS: page-only swipes/pinches, no custom touch listeners in scroll mode, native scrolling, mode changes, one-unit sizing, tap controls, selection, overlays, text boundaries, fullscreen, bounds, both practices/languages, timers/visualization and persistence.');
  } finally {await browser.close();if (server) server.close();}
}
main().catch(error => {console.error(error);if (server) server.close();process.exitCode=1;});
