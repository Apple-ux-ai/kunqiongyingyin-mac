import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(__dirname, 'manual_full.html');
const pdfLocalized = path.resolve(__dirname, '鲲穹影音使用说明.pdf');
const pdfAscii = path.resolve(__dirname, 'kunqiong-player-manual.pdf');

function altPath(p, suffix) {
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  return path.join(dir, `${base}${suffix}${ext}`);
}

async function exportOne(outPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'screen' });
  try {
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } catch (e) {
    if (e?.code === 'EBUSY') {
      const fallback = altPath(outPath, '_更新');
      await page.pdf({
        path: fallback,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      });
    } else {
      throw e;
    }
  }
  await browser.close();
}

async function main() {
  await exportOne(pdfLocalized);
  await exportOne(pdfAscii);
  console.log('[pdf] done');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

