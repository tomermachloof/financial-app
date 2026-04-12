# Finance Rules — Financial App

מסמך זה מגדיר את כללי העסק האמיתיים של המערכת.
כל שינוי קוד שנוגע לכסף חייב לעמוד בחוקים האלה.

---

## 1. מה משפיע על יתרת חשבון ומה לא

### משפיע — account.balance מתעדכן

| פעולה | איך |
|-------|-----|
| `confirmEvent()` | balance += delta (ILS) או usdBalance += delta (USD) |
| `unconfirmEvent()` | הופך: balance -= delta |
| `markIncomeReceived()` | balance += amount (או ×0.85 אם עמלת סוכן) |
| `markIncomePending()` | הופך: balance -= _receivedAmt |
| `setFriendMoneyReceived()` | balance += _delta (כשחבר מחזיר תשלום הלוואה) |
| `undoFriendMoneyReceived()` | הופך: balance -= _delta |
| `confirmEvent()` עם destAccountId | גם החשבון המקור מתחייב וגם היעד מזוכה |

### לא משפיע — balance נשאר ללא שינוי

| פעולה / flag | סיבה |
|-------------|-------|
| `noBalanceEffect = true` | הכנסה/הוצאה קיזזו זו את זו (למשל שכירות סוקולוב מול משכנתא) |
| `paidViaCredit = true` | ההוצאה נרשמת אבל ירידה תהיה בכרטיס אשראי בנפרד |
| `updateFutureIncome()` בלבד | עריכה בלבד — לא אישור קבלה |
| `addFutureIncome()` | רישום הכנסה עתידית — לא מפקיד כלום עדיין |
| הוספת הלוואה/הוצאה/הכנסה חוזרת | רישום מבנה בלבד — הכסף יזוז רק ב-confirmEvent |
| `paidByFriend = true` על הלוואה | ההלוואה לא מחשבת ב-liabilities ולא גובה מחשבון |

### העברה בין חשבונות
```
confirmEvent(id, date, accountId=SRC, delta=-X, ..., destAccountId=DEST)
→ SRC.balance -= X
→ DEST.balance += X
```
- אם `destAccountId` מתחיל ב-`inv:` → מעדכן Investment.value, לא Account.balance

---

## 2. כללי הלוואות

### חישוב יתרה
1. אם `balanceOverride != null` → משתמש בו ישירות, מסמן `isOverride: true`
2. אם חסר אחד מ: `startDate`, `totalAmount`, `durationMonths` → מחזיר `missing[]`, לא מחשב
3. ריבית 0% → יתרה = `totalAmount - (n × totalAmount/N)`
4. ריבית > 0 → שפיצר: `B(n) = P × [(1+r)^N − (1+r)^n] / [(1+r)^N − 1]`
   - `r = interestRate/100/12` (ריבית חודשית)
   - `n = paymentsMade` (תשלומים שבוצעו)
5. אם `n >= N` → יתרה = 0

### חישוב תשלומים שבוצעו
- תשלום ראשון = יום chargeDay בחודש שאחרי חודש ההתחלה
- אם chargeDay נופל פחות מ-15 יום אחרי startDate → מקדמים חודש נוסף
- סופרים כמה chargeDay-ים עברו מאז עד היום

### הלוואת חבר (`paidByFriend = true`)
- **לא** נכללת בחישוב `calcTotalLiabilities`
- **לא** מחייבת חשבון בנק בcalendar/dashboard
- מוצגת בפאנל נפרד
- כשחבר מחזיר כסף → `setFriendMoneyReceived()` → balance += delta
- כשמבטלים → `undoFriendMoneyReceived()` → balance -= delta

### שדות חובה להלוואה
- `name` — חובה
- `monthlyPayment` — חובה (אחרת אירוע לא ניתן לחשב)
- `chargeDay` — חובה להצגה בcalendar
- ⚠️ בלי `startDate` + `totalAmount` + `durationMonths` — יתרת הלוואה לא ניתנת לחישוב

---

## 3. הוצאות חוזרות (Expense)

### התנהגות
- כל הוצאה עם `chargeDay` מופיעה בכל חודש בcalendar ובdashboard
- סכום חודשי ספציפי: `monthlyAmounts['YYYY-MM']` מכסה את `amount`
- USD: סכום = `usdAmount × usdRate` (מחושב בזמן ריצה)

### flags
- `noBalanceEffect` — אירוע מוצג, לא גורר שינוי יתרה
- `paidViaCredit` — מוצג, לא גורר שינוי יתרה (חיוב ידני בכרטיס)
- `destAccountId` — העברה: מקור מחויב, יעד מזוכה

### שדות חובה
- `name`, `amount` (או `usdAmount`), `chargeDay`

---

## 4. הכנסות חוזרות (RentalIncome)

### התנהגות
- מופיעה בכל חודש בcalendar (ב-green)
- אינה נכנסת לחשבון אוטומטית — רק אחרי `confirmEvent`
- `noBalanceEffect = true` → מוצגת בלבד (קיזוז מול הוצאה אחרת, למשל סוקולוב מול משכנתא)
- `debtId` → מסמן שהכנסה הזו קשורה לחוב (ריבית שליו, ריבית גיא)

### הבדל מ-FutureIncome
| | RentalIncome | FutureIncome |
|--|------------|------------|
| חוזרת? | כן — כל חודש | לא — חד פעמית |
| מתי נכנסת לחשבון? | לאחר confirmEvent | לאחר markIncomeReceived |
| status? | אין | pending / received |
| ימי עבודה? | לא | כן (sessions[]) |

### שדות חובה
- `name`, `amount` (או `usdAmount`), `chargeDay`

---

## 5. הכנסות עתידיות (FutureIncome)

### סטטוסים
- `pending` → טרם התקבלה, מוצגת בdashboard ו-calendar
- `received` → התקבלה, נכנסה לחשבון, לא מוצגת כאירוע עתידי

### קבלת הכנסה
```
markIncomeReceived(id, accountId)
→ amt = agentCommission ? amount × 0.85 : amount
→ account.balance += amt
→ שמירה: _receivedAmt, _receivedAccId, receivedDate
```
- אם `accountId` לא מוגדר ואין `item.accountId` → balance לא מתעדכן (רק status משתנה)

### ביטול קבלה
```
markIncomePending(id)
→ account.balance -= _receivedAmt
→ איפוס: _receivedAmt, _receivedAccId, receivedDate
```

### ימי עבודה (sessions)
- כל session: `amount = quantity × ratePerUnit + overtimeHours × overtimeRate`
- סה"כ FutureIncome.amount = סכום כל ה-sessions
- הוספת session → amount מחושב מחדש אוטומטית
- מחיקת session → amount מחושב מחדש אוטומטית

### `isPayment = true`
- הכנסה שלילית (תשלום חד-פעמי) — מוצגת אדום בcalendar

### שדות חובה
- `name`, `status`
- `amount` — חובה אם אין sessions. אם יש sessions — מחושב.
- `expectedDate` — אופציונלי, אבל בלעדיו לא מופיע בcalendar

---

## 6. חובות (Debt)

### שני סוגים
| type | משמעות | השפעה על Net Worth |
|------|---------|------------------|
| `owed_to_us` | חייבים לנו (נכס) | נכלל ב-Assets (+) |
| `we_owe` | אנחנו חייבים | נכלל ב-Liabilities (-) |

### הבדל מ-Loan
| | Loan | Debt |
|--|------|------|
| תשלום חוזר? | כן | לא |
| מופיע ב-calendar? | כן | לא |
| ריבית? | כן | לא |
| חישוב שפיצר? | כן | לא |

### חוב במטבע זר
- `currency = 'EUR'` / `'USD'` + `originalAmount` → ערך ₪ = originalAmount × rate
- `amount` בשקלים משמש כברירת מחדל אם אין currency

---

## 7. המרת מטבע

### כלל גורף
**לא שומרים ערך ממוּמר.** תמיד שומרים את הערך המקורי במטבע המקורי ומחשבים בזמן ריצה.

| entity | שדה מקורי | חישוב |
|--------|-----------|-------|
| Account (USD) | `usdBalance` | `usdBalance × usdRate` |
| Expense (USD) | `usdAmount` | `usdAmount × usdRate` |
| RentalIncome (USD) | `usdAmount` | `usdAmount × usdRate` |
| Debt (EUR) | `originalAmount` | `originalAmount × eurRate` |
| Debt (USD) | `originalAmount` | `originalAmount × usdRate` |
| Investment (EUR/USD) | `originalAmount` | `originalAmount × rate` |
| Loan (USD) | `monthlyPayment` | `monthlyPayment × usdRate` |

### שערים
- `usdRate` — USD/ILS
- `eurRate` — EUR/ILS
- `primeRate` — ריבית הפריים (לחישוב הלוואות prime±X)
- כולם מוגדרים ידנית בstore

### ⚠️ שאלה פתוחה
כיצד מחשבים ריבית `prime+0.5` / `prime-0.7`? הקוד מגדיר `interestType` אבל `calcRemainingBalance` משתמש רק ב-`interestRate` (מספר). **נראה שה-interestType לא מתורגם אוטומטית ל-interestRate.** מי מכניס את הריבית האפקטיבית?

---

## 8. חישובי KPI

### Liquidity (נזילות)
```
Σ accounts.balance (ILS) + Σ accounts.usdBalance × usdRate
```

### Monthly Out (יציאות חודשיות)
```
Σ loans.monthlyPayment + Σ loans.extras.amount
+ Σ expenses.amount (או monthlyAmounts[currentMonth])
+ Σ expenses (USD) × usdRate
```
⚠️ **לא** מחסיר `noBalanceEffect` ו-`paidViaCredit` — כולל הכל

### Monthly In (הכנסות חוזרות)
```
Σ rentalIncome.amount + Σ rentalIncome (USD) × usdRate
```
⚠️ **לא** מסנן `noBalanceEffect` — כולל גם הכנסות מקזזות

### Safe to Spend
```
Liquidity
- Σ loans.monthlyPayment (chargeDay > today)
- Σ expenses.amount (chargeDay > today)
- Σ expenses.amount (chargeDay = null)  ← כל הוצאה ללא תאריך
```
⚠️ **לא** מחסיר הוצאות USD לפי chargeDay (רק ILS). **בעיה אפשרית.**

### Net Worth
```
Assets - Liabilities
Assets     = Liquidity + Investments + DebtsOwedToUs
Liabilities = Σ loan.balance (לא paidByFriend) + DebtsWeOwe
```

---

## 9. validations — חובה לפני שמירה

### Account
- [ ] `name` לא ריק
- [ ] `balance` הוא מספר (יכול להיות שלילי)
- [ ] אם `currency = 'USD'` → חייב `usdBalance`

### Loan
- [ ] `name` לא ריק
- [ ] `monthlyPayment` > 0
- [ ] `chargeDay` בין 1–31
- [ ] אם `interestType` הוא prime±X → לוודא שהמשתמש הגדיר `interestRate` מחושב

### Expense
- [ ] `name` לא ריק
- [ ] `amount` > 0 (או `usdAmount` > 0)
- [ ] אם `destAccountId` קיים → לוודא שהחשבון קיים

### RentalIncome
- [ ] `name` לא ריק
- [ ] `amount` > 0 (או `usdAmount` > 0)

### FutureIncome
- [ ] `name` לא ריק
- [ ] `amount` > 0 **או** יש sessions עם amount
- [ ] אם `agentCommission = true` → לוודא שיש amount

### Debt
- [ ] `name` לא ריק
- [ ] `amount` > 0 (או `originalAmount` > 0)
- [ ] `type` הוא `owed_to_us` או `we_owe`

### confirmEvent
- [ ] `accountId` קיים ב-accounts
- [ ] `delta` הוא מספר שונה מ-0
- [ ] אם `destAccountId` קיים → החשבון או ה-investment קיים

---

## 10. edge cases שיכולים לשבור מעקב כספי

| מצב | מה יקרה | כיצד למנוע |
|-----|---------|------------|
| `markIncomeReceived` ללא accountId | status=received אבל balance לא מתעדכן — כסף "נעלם" | לחייב בחירת חשבון לפני אישור |
| מחיקת חשבון שיש לו `confirmedEvents` | הלוג מצביע לחשבון שלא קיים | לאסור מחיקה אם יש events מקושרים |
| `unconfirmEvent` על event עם `_ro: true` | קוד הUI אמור למנוע — אין בדיקה בstore | להוסיף guard בstore |
| הוצאה USD ב-`calcSafeToSpend` | לא מחסיר USD expenses לפי chargeDay | באג קיים — לתקן |
| הלוואת prime±X — interestRate לא מעודכן | calcRemainingBalance מחשב לפי ריבית ישנה | להוסיף חישוב אוטומטי של interestRate מ-primeRate |
| FutureIncome עם sessions — עריכת amount ידנית | amount יוחלף אבל sessions לא יתואמו | לנטרל שדה amount אם יש sessions |
| `noBalanceEffect` ב-calcMonthlyOut/In | מחשב גם הכנסות/הוצאות מקזזות → נתוני monthly לא נקיים | לתעד או לסנן בחישוב |
| שני devices גישה במקביל | Supabase + localStorage = race condition | ⚠️ שאלה פתוחה: מה קורה כשיש conflict? |
