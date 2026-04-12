# Tasks — Financial App

## אגדה
- 🔴 גבוה — משפיע על נתונים / חישובים
- 🟡 בינוני — UX / תחזוקה
- 🟢 נמוך — שיפורים / nice-to-have

---

## פתוח כרגע

### 🔴 נתונים וחישובים

- [ ] **שערי חליפין אוטומטיים** — liveLiveRates.js קיים אבל לא פעיל. להפעיל fetch אוטומטי ל-EUR/USD/Prime בטעינה.
- [ ] **הלוואות ללא startDate** — 7+ הלוואות חסרות תאריך התחלה. להוסיף אינדיקציה ברורה למשתמש (אזהרה ויזואלית ביד הלוואה).
- [ ] **יתרות חשבונות** — אזהרה בinitialData: "עודכן ספטמבר 2024, יש לעדכן יתרות". לוודא שהיתרות עדכניות.
- [ ] **helper מרכזי למטבע** — `toILS(amount, currency, rates)` — לאחד את כל המרות USD/EUR במקום אחד.

### 🟡 UX / שימושיות

- [ ] **פיצול QuickAddModal** — 35KB קומפוננט אחד. לפצל לפחות ל: `AddLoanModal`, `AddExpenseModal`, `AddIncomeModal`.
- [ ] **פיצול Dashboard.jsx** — 1473 שורות. לחלץ לפחות: `UpcomingEvents`, `FriendLoanPanel`, `RemindersSection`.
- [ ] **monthlyAmounts ב-RentalIncome** — כמו בExpenses, לאפשר override חודשי גם להכנסות חוזרות.
- [ ] **Investment עם מטבע** — לשפר תצוגה של השקעות EUR/USD (value=0 מבלבל).

### 🟢 שיפורים

- [ ] **Entity types** — להגדיר factory function לכל entity (עם ברירות מחדל) כדי למנוע שדות חסרים.
- [ ] **helper `getMonthEvents` vs `getUpcomingEvents`** — לאחד לוגיקה חופפת.
- [ ] **תיעוד Supabase schema** — לתעד מה שמור בענן (app_state, push_subscription, etc.).

---

## הושלם

- [x] **גרסאות PWA** — bump-version.js + version.txt מאלץ reload בכל מכשיר
- [x] **Push notifications** — Cloudflare Worker שולח התראה יומית ל-Supabase
- [x] **עריכת הכנסות מהדאשבורד** — QuickAddModal כולל "עריכת הכנסה 📗" כאפשרות ראשונה
- [x] **ברכה לפי משתמש** — לחיצה ארוכה על השם מחליפה תומר/יעל (נשמר ב-localStorage)
- [x] **deploy אוטומטי** — `npm run build && npm run deploy` + אימות bundle לאחר כל שינוי
