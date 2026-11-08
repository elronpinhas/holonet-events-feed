/**
 * Holonet public event page reader for an external Playwright worker.
 * Run: npm install --no-save playwright && npx playwright install chromium
 *      node scripts/holonet-playwright.mjs > holonet-events.json
 * Runs in this public repository's GitHub Actions workflow. It reads only public event pages.
 * No Base44 application code or credentials are included.
 */
import { chromium } from 'playwright';

const LIST_URL = 'https://holonet.co.il/category/event/all/%D7%90%D7%99%D7%A8%D7%95%D7%A2%D7%99%D7%9D';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
try {
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('a.as-twl-list-item-box[href^="/event/"]').first().waitFor({ timeout: 25000 });
  await page.waitForTimeout(1800);
  const cards = await page.locator('a.as-twl-list-item-box[href^="/event/"]').evaluateAll(nodes => nodes.map(node => ({
    url: new URL(node.getAttribute('href'), location.origin).toString(),
    title: node.querySelector('h4')?.textContent?.trim() || '',
    dateText: node.querySelector('.as-twl-list-item-content-st b')?.textContent?.trim() || '',
    timeText: Array.from(node.querySelectorAll('.as-twl-list-item-content-st b')).map(x => x.textContent?.trim()).find(x => /^\d{1,2}:\d{2}$/.test(x || '')) || '',
    description: node.querySelector('.as-twl-list-item-content-st + div')?.textContent?.trim() || '',
    image_url: node.querySelector('img')?.getAttribute('src') || ''
  })));
  const now = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jerusalem'}));
  const reference = new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  const maxDate = new Date(reference.getTime()+240*86400000);
  const events = [];
  const seen = new Set();
  let skippedNoDate = 0;
  for (const c of cards) {
    const id = c.url.match(/\/event\/(\d+)/)?.[1];
    const dateParts = c.dateText.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?/);
    if (!id || !c.title || /בוטל|מבוטל/.test(c.title)) continue;
    if (!dateParts) { skippedNoDate++; continue; }
    const [,day,month,explicitYear] = dateParts;
    const years = explicitYear ? [Number(explicitYear)] : [reference.getUTCFullYear(),reference.getUTCFullYear()+1];
    const date = years.map(y=>new Date(Date.UTC(y,Number(month)-1,Number(day))))
      .find(d=>d.getUTCDate()===Number(day) && d.getUTCMonth()+1===Number(month) && d>=reference && d<=maxDate);
    if (!date) continue;
    const start_date=date.toISOString().slice(0,10);
    const key=id+'|'+start_date;
    if (seen.has(key)) continue;
    seen.add(key);
    const canonicalUrl = new URL(c.url);canonicalUrl.search='';
    events.push({
      title:c.title, source_name:'רשת קהילה ופנאי', source_url:canonicalUrl.toString(),
      registration_url:canonicalUrl.toString(), start_date, end_date:start_date,
      start_time:c.timeText==='00:00'?'':c.timeText,
      venue_name:'רשת קהילה ופנאי חולון',
      short_description:c.description.slice(0,240),full_description:c.description,
      image_url:c.image_url, organizer_name:'רשת קהילה ופנאי חולון',
      extraction_status:'official_browser_rendered'
    });
  }
  process.stdout.write(JSON.stringify({
    source:'holonet.co.il', generated_at:new Date().toISOString(),
    page_url:LIST_URL, rendered_cards:cards.length, skipped_no_date:skippedNoDate, events
  },null,2)+'\n');
  if (cards.length===0) process.exitCode=2;
} finally { await browser.close(); }
