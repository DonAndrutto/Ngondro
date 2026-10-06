const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const reference = process.env.EWAM_REFERENCE_HTML || path.join(root, '../Ewam/index.html');
const server = require('./server.cjs').createServer(reference);

async function main() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch(process.env.EWAM_BROWSER_PATH ? {executablePath:process.env.EWAM_BROWSER_PATH} : {});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button',{name:'Enter — Kunzang Gongdu Ngöndro',exact:true}).click();
    await page.getByRole('button',{name:'Proceed to the Text',exact:true}).click();
    assert.equal(await page.locator('.reader-toolbar .bar-btn:visible').count(),10);
    assert.equal(await page.locator('input[type="search"],#readerSearch,#searchPanel').count(),0);
    assert.equal(await page.locator('#pageNavigation').isVisible(),false);
    assert.deepEqual(await page.locator('.reader-toolbar button').evaluateAll(buttons => buttons.map(button => button.id || button.getAttribute('onclick'))),
      ['changeSpeed(-1)','btnPlay','changeSpeed(1)','btnPage','btnFS','btnTilt','btnTimerCfg','btnTheme','changeFontSize(-1)','changeFontSize(1)']);
    await page.evaluate(() => {window.scrollTo(0,1000);});
    await page.locator('#scrollTopBtn').click();
    await page.waitForFunction(() => scrollY === 0);
    await page.locator('#btnPage').click();
    assert.equal(await page.locator('#btnPage').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#btnPlay').isDisabled(),true);

    // Compare the shared controls against the actual reviewed Ewam revision.
    if (fs.existsSync(reference)) {
      const ewam = await browser.newPage({viewport:{width:390,height:844}});
      await ewam.goto(url + '/ewam/');
      await ewam.evaluate(() => {document.getElementById('ykLoader').remove(); closeWelcome(); toggleReadingMode();});
      const commonUI = () => {
        const selectors = ['#btnPage','#btnFS','#btnTilt','#btnTheme','[onclick="changeSpeed(-1)"]','[onclick="changeSpeed(1)"]',
          '#btnPlay','[onclick="changeFontSize(-1)"]','[onclick="changeFontSize(1)"]','#btnPreviousPage','#btnNextPage','.reader-toolbar'];
        const properties = ['height','padding','borderRadius','backgroundColor','color','border','boxShadow','gap','fontFamily','fontSize','transitionDuration'];
        return selectors.map(selector => {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          return {selector,styles:Object.fromEntries(properties.map(property => [property,style[property]])),
            icon:element.tagName === 'BUTTON' ? element.innerHTML.replace(/\s+/g,' ').trim() : null};
        });
      };
      for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
        await page.setViewportSize(viewport);
        await ewam.setViewportSize(viewport);
        await page.evaluate(() => layoutReadingPage(readingPage.anchor));
        await ewam.evaluate(() => layoutReadingPage(readingPage.anchor));
        assert.deepEqual(await page.evaluate(commonUI),await ewam.evaluate(commonUI),'shared controls match Ewam');
      }
      await ewam.close();
      console.log('Shared control icons and rendered styles match Ewam.');
    }

    const layouts = [
      {width:390,height:844,font:16},{width:320,height:568,font:16},
      {width:844,height:390,font:16},{width:1280,height:800,font:16},
      {width:390,height:844,font:40},{width:568,height:320,font:40}
    ];
    let fragments = 0;
    for (const layout of layouts) {
      await page.setViewportSize({width:layout.width,height:layout.height});
      const report = await page.evaluate(async ({font}) => {
        state.fontSize = font;
        applyFontSize();
        const failures = [];
        let lines = 0;
        for (const lang of ['en','pl']) {
          setLanguage(lang);
          for (const tab of ['YOGA','NGONDRO']) {
            switchTab(tab);
            for (const scripts of [[true,true,true],[true,true,false],[true,false,true],[false,true,true],
              [true,false,false],[false,true,false],[false,false,true]]) {
              [state.showTibetan,state.showPhonetics,state.showTranslation] = scripts;
              syncScriptToggles();
              for (let index = 0; index < trackedSectionNodes.length; index++) {
                readingPage.section = index;
                readingPage.index = 0;
                layoutReadingPage();
                const section = trackedSectionNodes[index];
                await Promise.all(Array.from(section.querySelectorAll('img'),img => img.decode().catch(() => {})));
                layoutReadingPage();
                const area = document.getElementById('contentArea').getBoundingClientRect();
                const walker = document.createTreeWalker(section,NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                  if (!node.textContent.trim()) continue;
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  for (const rect of range.getClientRects()) {
                    if (!rect.width || !rect.height) continue;
                    lines++;
                    if (rect.top < area.top - 1 || rect.bottom > area.bottom + 1) failures.push({lang,tab,index,scripts,bid:node.parentElement.closest('.block')?.dataset.bid,
                      text:node.textContent.slice(0,30),top:rect.top-area.top,bottom:rect.bottom-area.bottom});
                  }
                }
                for (const el of section.querySelectorAll('img,.block-timer,.visualize-btn')) {
                  const rect = el.getBoundingClientRect();
                  if (rect.height && (rect.top < area.top - 1 || rect.bottom > area.bottom + 1)) failures.push({lang,tab,index,element:el.tagName});
                }
              }
            }
          }
        }
        const buttons = Array.from(document.querySelectorAll('.reader-toolbar .bar-btn')).map(button => button.getBoundingClientRect());
        const widths = buttons.map(rect => rect.width);
        if (Math.max(...widths) - Math.min(...widths) > 1 || buttons.some(rect => rect.left < 0 || rect.right > innerWidth)) failures.push({toolbar:true});
        const controls = document.querySelectorAll('.header-inner button,.header-inner a,.header-title');
        for (const element of controls) {
          if (!element.offsetParent) continue;
          const rect = element.getBoundingClientRect();
          if (rect.left < -1 || rect.right > innerWidth + 1) failures.push({header:element.id || element.className});
        }
        const style = getComputedStyle(document.querySelector('.block'));
        if (style.animationName !== 'none' || style.transitionDuration !== '0s') failures.push({motion:true});
        return {failures:failures.slice(0,10),lines};
      },layout);
      assert.deepEqual(report.failures,[],JSON.stringify(layout));
      fragments += report.lines;
      console.log('Line boundaries:',layout,report.lines,'fragments');
    }

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => {state.fontSize=16; state.showTibetan=state.showPhonetics=state.showTranslation=true; applyFontSize(); setLanguage('en'); switchTab('NGONDRO');});
    await page.locator('#btnNextPage').click();
    assert.equal(await page.evaluate(() => readingPage.index),1);
    await page.locator('#btnPreviousPage').click();
    assert.equal(await page.evaluate(() => readingPage.index),0);
    await page.locator('#btnPage').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => readingPage.index),1);
    await page.mouse.click(370,250);
    assert.equal(await page.evaluate(() => readingPage.index),2);
    await page.mouse.click(20,250);
    assert.equal(await page.evaluate(() => readingPage.index),1);
    await page.evaluate(() => {window.testAnchor=captureReadingAnchor();});
    const anchorVisible = () => page.evaluate(() => {
      const rect = testAnchor.range.getBoundingClientRect();
      const area = document.getElementById('contentArea').getBoundingClientRect();
      return rect.left >= area.left - 1 && rect.right <= area.right + 1 && rect.top >= area.top - 1 && rect.bottom <= area.bottom + 1;
    });
    await page.locator('[onclick="changeFontSize(1)"]').click();
    assert.equal(await anchorVisible(),true,'zoom anchor');
    await page.evaluate(() => {window.testAnchor=captureReadingAnchor();});
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await anchorVisible(),true,'landscape anchor');
    await page.screenshot({path:path.join(root,'test-results/landscape.png')});
    await page.evaluate(() => {window.testAnchor=captureReadingAnchor();});
    await page.locator('#btnFS').click();
    assert.equal(await page.locator('.reader-toolbar .bar-btn:visible').count(),1);
    assert.equal(await page.locator('#pageNavigation').isVisible(),false);
    assert.equal(await page.locator('#scrollTopBtn').isVisible(),false);
    assert.equal(await anchorVisible(),true,'fullscreen anchor');
    await page.mouse.click(820,150);
    await page.locator('#btnFS').click();
    assert.equal(await page.locator('.reader-toolbar .bar-btn:visible').count(),10);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(root,'test-results/portrait.png')});

    // Ngondro's up button always goes to the beginning of its active text.
    await page.evaluate(() => {readingPage.section=5; readingPage.index=1; layoutReadingPage();});
    await page.locator('#scrollTopBtn').click();
    assert.deepEqual(await page.evaluate(() => [readingPage.section,readingPage.index,state.activeTab]),[0,0,'NGONDRO']);
    await page.evaluate(() => scrollToTop());
    assert.deepEqual(await page.evaluate(() => [readingPage.section,readingPage.index,state.activeTab]),[0,0,'NGONDRO']);
    await page.locator('[data-tab="INDEX"]').click();
    await page.locator('.index-item[data-index-tab="NGONDRO"][data-section-idx="4"]').click();
    await page.waitForFunction(() => readingPage.section === 4);
    await page.waitForFunction(() => document.querySelector('.index-item[aria-current="location"]')?.dataset.sectionIdx === '4');
    await page.evaluate(() => {window.testBid=captureReadingAnchor().block.dataset.bid;});
    await page.locator('#btnEng').click();
    await page.locator('#btnEng').click();
    await page.evaluate(() => setLanguage('pl'));
    assert.equal(await page.locator('#btnPage').getAttribute('aria-label'),'Tryb stronicowania');
    assert.equal(await page.locator('#btnNextPage').getAttribute('aria-label'),'Następna strona');
    assert.equal(await page.evaluate(() => readingPage.section),4);
    await page.evaluate(() => setLanguage('en'));

    // Timer settings and inline timer buttons stay usable in page mode.
    await page.locator('#btnTimerCfg').click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => readingPage.section),4,'dialog blocks page turns');
    await page.locator('#timerDialog [onclick="closeTimerDialog()"]').click();
    await page.evaluate(() => {readingPage.section=1; layoutReadingPage({block:document.getElementById('timer-block-0'),range:null});});
    await page.locator('#timer-play-0').click();
    assert.equal(await page.evaluate(() => timerRuntime.activeKey),0);
    await page.locator('#timer-play-0').click();
    assert.equal(await page.evaluate(() => timerRuntime.activeKey),-1);
    await page.evaluate(() => {openGarland();});
    assert.equal(await page.evaluate(() => omReducedMotion() && omRt.raf === null),true);
    await page.locator('#gBtnClose').click();
    await page.locator('#btnPage').click();
    assert.equal(await page.evaluate(() => state.readingMode),'scroll');
    await page.locator('#scrollTopBtn').click();
    await page.waitForFunction(() => scrollY === 0);
    await page.locator('#btnPage').click();
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#btnPage').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#pageNavigation').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS:',fragments,'line fragments; shared Ewam UI, top-of-text navigation, languages/scripts, page turns, zoom, rotation, fullscreen, index, timers, static visualization, saved mode.');
  } catch (error) {
    console.error('Reader state:',await page.evaluate(() => ({mode:state.readingMode,tab:state.activeTab,lang:state.lang,scroll:scrollY,
      page:{section:readingPage.section,index:readingPage.index,count:readingPage.count}})));
    await page.screenshot({path:path.join(root,'test-results/failure.png')});
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => {console.error(error);server.close();process.exitCode=1;});
