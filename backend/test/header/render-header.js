const path = require('path');
const TOOLS = '/tmp/claude-0/-home-claude/d288ce8a-9fb4-525b-a522-7978d23df615/scratchpad/tools/node_modules/';
const { chromium } = require(TOOLS + 'playwright');
const sharp = require(TOOLS + 'sharp');
const OUT = '/home/claude/pitchmasters-hub/assets/email/';
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
  await p.goto('file://' + path.join(__dirname, 'header.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await (await p.$('#h')).screenshot({ path: __dirname + '/h-raw.png' });
  await (await p.$('#s')).screenshot({ path: __dirname + '/s-raw.png' });
  await b.close();
  for (const [src, dst, quality] of [['h-raw.png', 'royale-header.png', 98], ['s-raw.png', 'royale-share.png', 100]]) {
    await sharp(path.join(__dirname, src)).png({ palette: true, quality, dither: 1, compressionLevel: 9, effort: 10 }).toFile(OUT + dst);
    const m = await sharp(OUT + dst).metadata();
    console.log(dst, m.width + 'x' + m.height, require('fs').statSync(OUT + dst).size + ' bytes');
  }
})();
