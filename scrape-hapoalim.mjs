import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';

const __dir = dirname(fileURLToPath(import.meta.url));
const IS_CI = !!process.env.GITHUB_ACTIONS;

// ── פרטי כניסה: מ-.env.scraper לוקאלית, מ-process.env ב-CI ──────
let env = {};
const envFile = join(__dir, '.env.scraper');
if (existsSync(envFile)) {
  env = Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  );
} else {
  env = {
    HAPOALIM_USER: process.env.HAPOALIM_USER,
    HAPOALIM_PASS: process.env.HAPOALIM_PASS,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    WORKER_ALERT_URL: process.env.WORKER_ALERT_URL,
    WORKER_SECRET: process.env.WORKER_SECRET,
  };
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const ACCOUNT_ID  = 'ba1';
const STATE_ID    = 'main';
const SESSION_ID  = 'scraper_session_hapoalim';
// תיקייה לשמירת session מקומי — משמשת לוקאלית בלבד (OTP persistence)
const USER_DATA_DIR = IS_CI ? null : join(__dir, '.scraper-session');

// ── Cookie helpers ────────────────────────────────────────────────
async function loadCookies() {
  const { data } = await supabase
    .from('app_state').select('state').eq('id', SESSION_ID).maybeSingle();
  return Array.isArray(data?.state?.cookies) ? data.state.cookies : [];
}

async function saveCookies(cookies) {
  if (!cookies || cookies.length === 0) return;
  const { error } = await supabase.from('app_state').upsert({
    id: SESSION_ID,
    state: { cookies, savedAt: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('שמירת cookies נכשלה:', error.message);
  else console.log(`נשמרו ${cookies.length} cookies ל-Supabase`);
}

// ── הפעלת הדפדפן ────────────────────────────────────────────────
// CI: Chrome של Ubuntu. לוקאל: Chrome של puppeteer עם userDataDir.
const browserOpts = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  ...(USER_DATA_DIR && { userDataDir: USER_DATA_DIR }),
  ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  }),
};

// ── טעינת cookies לזריקה (רק ב-CI) ─────────────────────────────
const savedCookies = IS_CI ? await loadCookies() : [];
if (IS_CI) console.log(`נטענו ${savedCookies.length} cookies שמורים`);

const browser = await puppeteer.launch(browserOpts);

// הזרקת cookies לפני שהסקרייפר מתחיל
if (savedCookies.length > 0) {
  const page = await browser.newPage();
  await page.setCookie(...savedCookies);
  await page.close();
  console.log('cookies הוזרקו לדפדפן');
}

const scraper = createScraper({
  companyId: CompanyTypes.hapoalim,
  startDate: new Date(new Date().setDate(1)),
  combineInstallments: false,
  browser,
});

console.log('מתחבר לפועלים...');
const result = await scraper.scrape({
  userCode: env.HAPOALIM_USER,
  password: env.HAPOALIM_PASS,
});

// ── שמירת cookies לפני סגירת הדפדפן ────────────────────────────
// נשמר גם לוקאלית (לגיבוי) וגם ב-CI — כדי ש-session יישאר עדכני ב-Supabase.
try {
  // CDP: מושך את כל ה-cookies מכל הדומיינים
  const allPages = await browser.pages();
  const anyPage = allPages[allPages.length - 1];
  if (anyPage) {
    const client = await anyPage.createCDPSession();
    const { cookies: allCookies } = await client.send('Network.getAllCookies');
    const hapoalimCookies = allCookies.filter(c =>
      c.domain && (c.domain.includes('hapoalim') || c.domain.includes('bankhapoalim'))
    );
    if (hapoalimCookies.length > 0) await saveCookies(hapoalimCookies);
  }
} catch (e) {
  console.warn('שמירת cookies דרך CDP נכשלה, מנסה שיטה חלופית:', e.message);
  // שיטה חלופית: ניווט לעמוד פועלים ושליפת cookies
  try {
    const page = await browser.newPage();
    await page.goto('https://www.bankhapoalim.co.il', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const cookies = await page.cookies();
    await page.close();
    if (cookies.length > 0) await saveCookies(cookies);
  } catch (e2) {
    console.warn('שיטה חלופית גם נכשלה:', e2.message);
  }
}

await browser.close();

// ── טיפול בשגיאות ────────────────────────────────────────────────
if (!result.success) {
  const isOTP = result.errorType === 'TWO_FACTOR_AUTH_REQUIRED' ||
                result.errorType === 'OTP_REQUIRED' ||
                result.errorType === 'CHANGE_PASSWORD_NEEDED';

  if (isOTP && !IS_CI) {
    // לוקאל: הנחה — הסשן לא נשמר עדיין. יש להריץ עם headless: false ידנית.
    console.error('\n⚠️  הבנק ביקש OTP או שינוי סיסמה.');
    console.error('פתרון: ערוך את הסקריפט ל-headless: false, הרץ שוב, והתחבר ידנית.');
    process.exit(2);
  }

  console.error('שגיאה:', result.errorType, result.errorMessage);
  process.exit(1);
}

const account = result.accounts?.[0];
if (!account) {
  console.error('לא נמצא חשבון בתוצאות');
  process.exit(1);
}

const newBalance = account.balance;
console.log(`חשבון: ${account.accountNumber}`);
console.log(`יתרה: ₪${newBalance.toLocaleString('he-IL')}`);
console.log(`עסקאות החודש: ${account.txns.length}`);

// ── עדכון Supabase ────────────────────────────────────────────────
const { data, error: readErr } = await supabase
  .from('app_state').select('state_v2').eq('id', STATE_ID).single();

if (readErr || !data) { console.error('שגיאת קריאה:', readErr); process.exit(1); }

const state = data.state_v2;
const oldBalance = state.accounts?.find(a => a.id === ACCOUNT_ID)?.balance;

const updatedAccounts = state.accounts.map(a =>
  a.id !== ACCOUNT_ID ? a : { ...a, balance: newBalance }
);

const now = Date.now();
const { error: writeErr } = await supabase
  .from('app_state')
  .update({
    state_v2: { ...state, accounts: updatedAccounts, lastSaved: now },
    updated_at: new Date().toISOString(),
  })
  .eq('id', STATE_ID);

if (writeErr) { console.error('שגיאת כתיבה:', writeErr); process.exit(1); }

console.log(`\n✓ עודכן: ₪${(oldBalance || 0).toLocaleString('he-IL')} → ₪${newBalance.toLocaleString('he-IL')}`);
