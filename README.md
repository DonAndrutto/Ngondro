# Ngondro
Kunzang Gongpa Kundu Ngondro

The page icon between **+** and **Fullscreen** switches between scrolling and page turning. Pages use native text columns without animation, keep whole lines, and reflow in portrait or landscape. Use the arrows, left/right edge taps, arrow keys, Page Up/Down, or Space / Shift+Space to turn pages. The reading mode is saved locally.

The shared reader controls use the same icons, spacing, and styling as Ewam. Ngondro keeps its script and language settings, timer settings button, and practice-specific tabs. Fullscreen hides the header and bottom options except its exit icon; edge taps and keyboard page turns remain available. The up arrow returns to the beginning of the active text in both modes. The mantra visualization remains still in page mode, with its settings available.

To run browser checks, install dependencies with `npm install`, install Chromium with `npx playwright install chromium`, and run `npm test`. Set `EWAM_BROWSER_PATH` to an installed Chrome executable if needed. The tests cover every section in English and Polish, script combinations, large text, portrait/landscape, top-of-text navigation, zoom, fullscreen, index links, timers, visualization, and saved preferences. Set `EWAM_REFERENCE_HTML` to Ewam's revised `index.html` for a direct comparison of the shared icons and rendered styles; a sibling Ewam checkout is detected automatically. Screenshots are written to `test-results/`.
