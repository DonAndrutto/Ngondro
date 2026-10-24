const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const approval = require('../editorial/approved-text-2026-10-24.json');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const TABS_DATA = {');
const end = html.indexOf('\n};', start) + 3;
const data = vm.runInNewContext(html.slice(start, end) + '; TABS_DATA');
const sections = Object.values(data).flat();
const blocks = sections.flatMap(section => section.blocks);
const byId = new Map([...sections, ...blocks].map(item => [item.id, item]));

assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length, 'stable, unique block IDs');
assert.equal(approval.paragraph_mappings.length, 98);
for (const mapping of approval.paragraph_mappings) {
  assert.equal(byId.get(mapping.block)?.[mapping.field], mapping.expected,
    `approved source paragraph ${mapping.source_paragraph}: ${mapping.block}.${mapping.field}`);
}
assert.equal(blocks.flatMap(block => block.editorialNotes || []).length, 0, 'no editorial notes in app data');
assert(!/editorialNote|editorial-note|Editorial note|Textual note/.test(html), 'no editorial note content or controls bundled in app');
for (const restored of approval.restored_blocks) {
  const section = sections.find(section => section.blocks.some(block => block.id === restored.block));
  assert(section.blocks.findIndex(block => block.id === restored.block) < section.blocks.findIndex(block => block.id === restored.before));
}
assert(byId.get('ng-6-24').tibetan.includes('མཐར་ཚོགས་ཞིང'));
assert(byId.get('ng-8-8').tibetan.includes('རང་གྱི་མགྲིན་པར་ཐིམ'), 'correct Guru Yoga throat line retained');
assert(byId.get('ng-7-drodul-lingpa').translation.includes('a kaya appearing a coalescence,'));
assert(byId.get('ng-5-17').tibetan.includes('ཤྲི་ཡཾ'), 'preserve the approved transmitted mantra reading');

const server = require('./server.cjs').createServer();
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.EWAM_BROWSER_PATH ? { executablePath: process.env.EWAM_BROWSER_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  try {
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('button', { name: 'Enter — Kunzang Gongdu Ngöndro', exact: true }).click();
    await page.getByRole('button', { name: 'Proceed to the Text', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    for (const lang of ['en', 'pl']) {
      for (const tab of ['YOGA', 'NGONDRO']) {
        await page.evaluate(({ lang, tab }) => { setLanguage(lang); switchTab(tab); }, { lang, tab });
        assert.equal(await page.locator('.editorial-note-marker, #editorialNotesDialog, .editorial-note-text').count(), 0,
          'practice text has no editorial note controls or content');
      }
    }
    const visualization = await page.evaluate(() => ({
      same: OM_SCENE.mantra === TABS_DATA.NGONDRO.flatMap(section => section.blocks).find(block => block.id === 'ng-5-17').tibetan,
      syllables: omSyllables(OM_SCENE.mantra).length,
      en: OM_PHONETICS_BY_LANG.en.length, pl: OM_PHONETICS_BY_LANG.pl.length
    }));
    assert.equal(visualization.same, true);
    assert.equal(visualization.syllables, visualization.en);
    assert.equal(visualization.syllables, visualization.pl);
    await page.evaluate(() => { setLanguage('pl'); switchTab('NGONDRO'); });
    assert.equal(await page.locator('[data-bid="ng-7-drodul-lingpa"] .eng').count(), 0, 'no unapproved English-as-Polish fallback');
    assert.deepEqual(errors, []);
    console.log('98 approved paragraphs, restored passages and mantra visualization verified; app contains no editorial notes.');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
