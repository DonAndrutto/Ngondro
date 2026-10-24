# Ngondro
Kunzang Gongpa Kundu Ngondro

The English text and shared Tibetan include the approved editorial decisions of 24 October 2026, synchronized from the [aligned working copy](https://docs.google.com/document/d/1xjZtz_x-05xsvoPAXmvXRRlwK-VQpcv9c5k6W14ApuQ). The app displays only the approved practice text, with no editorial notes, note markers or commentary panels. The mantra visualization uses the same Tibetan as the recitation block.

The [synchronization record](editorial/approved-text-2026-10-24.json) maps all 98 changed source paragraphs and archives the 19 editorial notes outside the app. It preserves the outstanding source questions: the dream/waking emendation and mantra normalizations are approved editorial readings, not a claim that source collation is complete. The separate Polish translation has not received this English editorial pass; restored passages without an approved Polish translation display their shared Tibetan without substituting English as Polish.

The page icon between **+** and **Fullscreen** switches between scrolling and page turning. Pages use native text columns without animation, keep whole lines, and reflow in portrait or landscape. Use the arrows, left/right edge taps, arrow keys, Page Up/Down, or Space / Shift+Space to turn pages. The reading mode is saved locally.

Page mode uses the same gesture engine as Ewam: swipe left for the next page,
right for the previous page, pinch to decrease the text size by 1, or spread to
increase it by 1, once per gesture while retaining the visible passage.
The custom touch handlers are completely removed in scroll mode. Use the
toolbar to resize text while scrolling. The engine is inline in `index.html`
so the app remains a single self-contained file.

The shared reader controls use the same icons, spacing, and styling as Ewam. Ngondro keeps its script and language settings, timer settings button, and practice-specific tabs. Fullscreen hides the header and bottom options except its exit icon; edge taps and keyboard page turns remain available. The up arrow returns to the beginning of the active text in both modes. The mantra visualization remains still in page mode, with its settings available.

To run browser checks, install dependencies with `npm install`, install Chromium with `npx playwright install chromium`, and run `npm test`. Set `EWAM_BROWSER_PATH` to an installed Chrome executable if needed. The tests cover every section in English and Polish, script combinations, large text, portrait/landscape, top-of-text navigation, zoom, fullscreen, index links, timers, visualization, and saved preferences. Set `EWAM_REFERENCE_HTML` to Ewam's revised `index.html` for a direct comparison of the shared icons and rendered styles; a sibling Ewam checkout is detected automatically. Screenshots are written to `test-results/`.
