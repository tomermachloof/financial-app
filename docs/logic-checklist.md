# Logic Checklist — Financial App

רשימת בדיקות לפני כל שינוי קוד שנוגע לכסף.
✅ = עובד כצפוי | ⚠️ = בעיה ידועה | ❌ = שבור | ❓ = לא ידוע

---

## A. יתרות חשבונות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| confirmEvent → balance מתעדכן נכון | ✅ | נבדק בקוד |
| unconfirmEvent → balance חוזר לקדמותו | ✅ | גורע בדיוק מה שנוסף |
| markIncomeReceived → balance += amount | ✅ | |
| markIncomeReceived עם agentCommission → ×0.85 | ✅ | |
| markIncomePending → balance -= _receivedAmt | ✅ | |
| markIncomeReceived ללא accountId → balance לא מתעדכן | ⚠️ | משתמש לא מקבל אזהרה |
| setFriendMoneyReceived → balance מתעדכן | ✅ | |
| undoFriendMoneyReceived → balance חוזר | ✅ | |
| noBalanceEffect → balance לא משתנה | ✅ | |
| paidViaCredit → balance לא משתנה | ✅ | |
| העברה עם destAccountId → שני חשבונות מתעדכנים | ✅ | |
| העברה ל-inv: → investment.value מתעדכן | ✅ | |
| unconfirm עם destAccountId → שני חשבונות חוזרים | ✅ | |

---

## B. הלוואות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| calcRemainingBalance עם balanceOverride → מחזיר override | ✅ | |
| calcRemainingBalance חסר startDate → missing[] | ✅ | |
| calcRemainingBalance חסר totalAmount → missing[] | ✅ | |
| calcRemainingBalance ריבית 0% → חלוקה שווה | ✅ | |
| calcRemainingBalance שפיצר → נוסחה נכונה | ✅ | |
| paidByFriend → לא בliabilities | ✅ | |
| paidByFriend → לא גובה מחשבון | ✅ | |
| הלוואה שהסתיימה → לא מופיעה ב-calendar | ✅ | endDate חושב |
| interestType = prime±X → interestRate מחושב אוטומטית | ❌ | interestRate חייב להיות ידני. לא מחושב מprimeRate |
| הלוואה ללא startDate → אזהרה למשתמש ב-UI | ⚠️ | מוצג "missing" אבל לא בולט |

---

## C. הוצאות חוזרות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| monthlyAmounts מכסה amount לחודש מסוים | ✅ | |
| הוצאה USD → מחושב ×usdRate | ✅ | |
| calcSafeToSpend — הוצאות ILS לפי chargeDay | ✅ | |
| calcSafeToSpend — הוצאות USD לפי chargeDay | ❌ | באג: USD expenses לא מסוננות לפי chargeDay |
| הוצאה ללא chargeDay → נחשבת כעתידית | ✅ | נכלל בundatedExpenses |
| noBalanceEffect → לא גורע מbalance | ✅ | |

---

## D. הכנסות חוזרות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| calcMonthlyIn → כולל USD × usdRate | ✅ | |
| calcMonthlyIn → כולל noBalanceEffect | ⚠️ | מצרף גם הכנסות שלא משפיעות על יתרה |
| הכנסה לא נכנסת אוטומטית לחשבון | ✅ | רק confirmEvent גורם לזה |
| debtId → הכנסה מקושרת לחוב | ✅ | שמור בשדה, מוצג בUI |

---

## E. הכנסות עתידיות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| status=pending → מוצגת בdashboard | ✅ | |
| status=received → לא מוצגת כאירוע | ✅ | |
| sessions → amount מחושב אוטומטית | ✅ | |
| עריכת amount ידנית כשיש sessions | ⚠️ | ניתן לשנות amount ידנית גם אם יש sessions — יכול לצאת מסנכרון |
| markIncomeReceived ללא accountId → רק status משתנה | ✅ | (אבל המשתמש לא מוזהר) |
| isPayment=true → מוצג אדום | ✅ | |
| expectedDate=null → לא מופיע בcalendar | ✅ | |

---

## F. חובות

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| owed_to_us → נכלל ב-Assets | ✅ | |
| we_owe → נכלל ב-Liabilities | ✅ | |
| Debt EUR → originalAmount × eurRate | ✅ | |
| Debt USD → originalAmount × usdRate | ✅ | |
| Debt לא מופיע בcalendar | ✅ | עיצובי — אין chargeDay |

---

## G. המרת מטבע

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| כל חישוב USD משתמש ב-usdRate מהstore | ✅ | |
| כל חישוב EUR משתמש ב-eurRate מהstore | ✅ | |
| שינוי usdRate → כל החישובים מתעדכנים מיד | ✅ | reactive state |
| לא שומרים ערך ממוּמר — רק הערך המקורי | ✅ | |
| Investment currency=EUR/USD → value=0, מחשב מoriginalAmount | ⚠️ | מבלבל למשתמש בעריכה |

---

## H. KPIs

| בדיקה | סטטוס | הערה |
|-------|--------|------|
| Liquidity = ILS accounts + USD × rate | ✅ | |
| Net Worth = Assets - Liabilities | ✅ | |
| Monthly Out כולל extras | ✅ | |
| Monthly Out לא מסנן noBalanceEffect | ⚠️ | מנפח את המספר |
| Safe to Spend מחסיר chargeDay > today | ✅ | |
| Safe to Spend — USD expenses לפי chargeDay | ❌ | לא מסונן |

---

## I. edge cases קריטיים

| מצב | סטטוס | פעולה נדרשת |
|-----|--------|-------------|
| מחיקת חשבון עם confirmedEvents | ❌ | אין guard — להוסיף בדיקה לפני מחיקה |
| unconfirm event עם `_ro: true` | ⚠️ | UI מונע, store לא — להוסיף guard בstore |
| race condition — שני מכשירים | ❓ | לא ידוע מה קורה עם Supabase conflict |
| interestRate לא מסונכרן עם primeRate | ❌ | משתמש חייב לעדכן ידנית — שגיאה שקטה |

---

## שאלות פתוחות

1. **prime±X**: מי מחשב את interestRate האפקטיבי כשprimeRate משתנה? כרגע — לא אחד.
2. **conflict resolution**: אם תומר ויעל משנים נתונים בו-זמנית — מה מנצח, localStorage או Supabase?
3. **noBalanceEffect בMonthly**: האם רצוי לסנן הכנסות/הוצאות מקזזות מMonthlyIn/Out, או להציגן ולהבהיר שהן "ניטרליות"?
4. **FutureIncome עם sessions + amount ידני**: האם amount ידני צריך לנצח sessions, או להיפך?
5. **markIncomeReceived ללא accountId**: האם להציג שגיאה, או לאפשר "received" ללא הפקדה?
