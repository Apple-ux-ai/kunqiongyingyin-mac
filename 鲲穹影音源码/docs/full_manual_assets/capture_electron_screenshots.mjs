import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..', '..');
const shotDir = path.resolve(__dirname, 'screenshots');

const shots = [
  { name: 'overview-home.png', action: async (page) => showWelcome(page) },
  { name: '01-open-url.png', action: async (page) => { await showWelcome(page); await showPanel(page, '#urlDialog'); } },
  { name: '02-welcome-open-file.png', action: async (page) => { await showWelcome(page); await ensureVisible(page, ['#openFileBtn']); } },
  { name: '03-playback-controls.png', action: async (page) => showPlaybackSurface(page) },
  { name: '04-playlist.png', action: async (page) => showPanel(page, '#playlistPanel') },
  { name: '05-speed.png', action: async (page) => showMenu(page, '#speedMenu') },
  { name: '06-screenshot.png', action: async (page) => { await showPlaybackSurface(page); await highlight(page, '#screenshotBtn'); } },
  { name: '07-pip.png', action: async (page) => { await showPlaybackSurface(page); await highlight(page, '#pipBtn'); await clickIfExists(page, '#pipBtn'); } },
  { name: '08-subtitle.png', action: async (page) => showPanel(page, '#subtitleSettingsPanel') },
  { name: '09-settings.png', action: async (page) => showPanel(page, '#settingsPanel') },
  { name: '10-login.png', action: async (page) => showPanel(page, '#userPanel') },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureVisible(page, selectors) {
  for (const s of selectors) {
    await page.waitForSelector(s, { state: 'attached', timeout: 15000 });
  }
}

async function resetUi(page) {
  await page.evaluate(() => {
    const idsToDeactivate = [
      'urlDialog',
      'playlistPanel',
      'subtitleSettingsPanel',
      'settingsPanel',
      'userPanel',
      'speedMenu',
    ];
    for (const id of idsToDeactivate) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.remove('active');
      // Keep DOM attached; hide visually.
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
    }

    // Remove any previous highlight.
    document.querySelectorAll('[data-manual-highlight="1"]').forEach((n) => {
      n.style.outline = '';
      n.style.outlineOffset = '';
      n.removeAttribute('data-manual-highlight');
    });
  });
}

async function showWelcome(page) {
  await resetUi(page);
  await page.evaluate(() => {
    const welcome = document.getElementById('welcomeScreen');
    if (welcome) {
      welcome.style.display = '';
      welcome.style.visibility = 'visible';
      welcome.style.opacity = '1';
    }
  });
  await ensureVisible(page, ['#welcomeScreen']);
}

async function showPlaybackSurface(page) {
  await resetUi(page);
  await page.evaluate(() => {
    const welcome = document.getElementById('welcomeScreen');
    if (welcome) welcome.style.display = 'none';
  });
  await ensureVisible(page, ['#videoPlayer', '#playBtn']);
}

async function showMenu(page, selector) {
  await showPlaybackSurface(page);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.add('active');
    el.style.display = '';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  }, selector);
  await ensureVisible(page, [selector]);
}

async function showPanel(page, selector) {
  await resetUi(page);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.add('active');
    el.style.display = '';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  }, selector);
  await ensureVisible(page, [selector]);
}

async function clickIfExists(page, selector) {
  const el = await page.$(selector);
  if (el) {
    try {
      await el.click({ timeout: 1000 });
    } catch {}
  }
}

async function highlight(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.setAttribute('data-manual-highlight', '1');
    el.style.outline = '3px solid #ffcc00';
    el.style.outlineOffset = '2px';
  }, selector);
}

async function main() {
  const electronApp = await electron.launch({
    cwd: projectRoot,
    args: ['.'],
  });

  const page = await electronApp.firstWindow();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForLoadState('domcontentloaded');
  await ensureVisible(page, ['body']);

  for (const s of shots) {
    try {
      await s.action(page);
      await sleep(250);
      const outPath = path.join(shotDir, s.name);
      await page.screenshot({ path: outPath });
    } catch (e) {
      console.error(`[capture] failed: ${s.name}`, e);
      await electronApp.close();
      process.exitCode = 1;
      return;
    }
  }

  await electronApp.close();
  console.log('[capture] done');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

