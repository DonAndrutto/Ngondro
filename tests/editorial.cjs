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
assert.equal(blocks.flatMap(block => block.editorialNotes || []).length, 19);
for (const [id, notes] of Object.entries(approval.notes)) {
  assert.equal(JSON.stringify(byId.get(id).editorialNotes), JSON.stringify(notes), `complete notes: ${id}`);
}
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
    let markers = 0;
    for (const tab of ['YOGA', 'NGONDRO']) {
      await page.evaluate(tab => { setLanguage('en'); switchTab(tab); }, tab);
      markers += await page.locator('.editorial-note-marker').count();
    }
    assert.equal(markers, 19, 'every approved note is reachable');
    for (const [id, notes] of Object.entries(approval.notes)) {
      await page.evaluate(id => openEditorialNotes(id), id);
      assert.equal(await page.locator('#editorialNotesDialog').isVisible(), true);
      assert.deepEqual(await page.locator('.editorial-note-text').allTextContents(), notes.map(note => note.text));
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.waitForFunction(() => !document.body.classList.contains('overlay-blur'));
    }
    await page.evaluate(() => { switchTab('YOGA'); });
    const firstNote = page.locator('[data-bid="1-2"] .editorial-note-marker');
    await firstNote.click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#editorialNotesDialog').isVisible(), false);
    assert.equal(await firstNote.evaluate(el => el === document.activeElement), true, 'focus returns to note marker');
    await page.evaluate(() => openEditorialNotes('1-10'));
    await page.screenshot({ path: path.join(root, 'test-results/editorial-note-mobile.png') });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
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
    console.log('98 approved paragraphs, 19 notes, restored passages and mantra visualization verified.');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
