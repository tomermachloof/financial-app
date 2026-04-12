# System Map — Financial App

## 1. Core Entities

| Entity | תיאור | שדות מרכזיים |
|--------|--------|--------------|
| **Account** | חשבון בנק | id, name, bank, balance, owner, type, currency, usdBalance |
| **Investment** | השקעה / פנסיה / חיסכון | id, name, value, type, owner, currency, originalAmount |
| **Loan** | הלוואה / משכנתא | id, name, totalAmount, monthlyPayment, chargeDay, interestRate, interestType, startDate, durationMonths, balanceOverride, accountId, paidByFriend, extras |
| **Expense** | הוצאה חוזרת | id, name, amount, chargeDay, category, accountId, monthlyAmounts, currency, usdAmount |
| **RentalIncome** | הכנסה חוזרת | id, name, amount, chargeDay, accountId, currency, usdAmount, noBalanceEffect, debtId |
| **FutureIncome** | הכנסה עתידית / חד-פעמית | id, name, amount, expectedDate, status, sessions[], agentCommission, invoiceSent, accountId |
| **Debt** | חוב (חייבים לנו / אנחנו חייבים) | id, name, amount, type, currency, expectedDate |
| **Reminder** | תזכורת | id, name, done, isMonthly, monthlyDay, doneMonths[] |
| **ConfirmedEvent** | לוג עסקאות שאושרו | id, date, accountId, delta, isUSD, destAccountId |
| **FriendReminder** | מעקב הלוואת חבר | loanId, monthKey, reminderSent, moneyReceived, _delta, _accountId |

---

## 2. Relationships

```
Account
  ← Loan.accountId          (הלוואה נגבית מחשבון)
  ← Expense.accountId       (הוצאה נגבית מחשבון)
  ← RentalIncome.accountId  (הכנסה נכנסת לחשבון)
  ← FutureIncome.accountId  (הכנסה עתידית נכנסת לחשבון)
  ← ConfirmedEvent.accountId (לוג עסקאות)
  ← ConfirmedEvent.destAccountId (העברות בין חשבונות)

Loan
  → paidByFriend → FriendReminder (מעקב תשלום חבר)
  → extras[]     (חיובים נוספים, למשל שעון)

RentalIncome
  → debtId → Debt (הכנסה מחשבון חוב, למשל ריבית שליו)

FutureIncome
  → sessions[] (ימי עבודה: צילום, חזרות, שעות נוספות)
  → markIncomeReceived → Account.balance += amount

Debt
  ← RentalIncome.debtId
```

---

## 3. State & Persistence

- **Store:** Zustand + persist → localStorage (key: `financial-app-v14`, version: 43)
- **Cloud:** Supabase — מסונכרן בעת טעינה ושמירה דרך `App.jsx`
- **Migration:** לוגיקת שדרוג גרסה מובנית בstore (43 גרסאות)
- **Exchange Rates:** EUR/USD/Prime מוגדרים ידנית (liveLiveRates.js קיים אבל לא בשימוש מלא)

---

## 4. Key Business Flows

### אישור עסקה
```
Dashboard → לחיצה על "אישור" → confirmEvent() → Account.balance += delta → ConfirmedEvent נרשם
```

### הכנסה עתידית התקבלה
```
IncomePage → "התקבל" → markIncomeReceived() → status='received' → Account.balance += amount (×0.85 אם עמלת סוכן)
```

### הלוואת חבר
```
Loan.paidByFriend=true → Dashboard מציג פאנל מיוחד → setFriendReminderSent() / setFriendMoneyReceived() → Account.balance += delta
```

### חישוב יתרת הלוואה
```
calcRemainingBalance(loan) → שפיצר: B(n) = P × [(1+r)^N − (1+r)^n] / [(1+r)^N − 1]
  → אם balanceOverride קיים → מחזיר אותו ישירות
  → אם startDate חסר → missing[]
```

### עדכון שער חליפין
```
לחיצה ידנית (או useLiveRates hook) → setPrimeRate / setEurRate / setUsdRate → כל חישובי USD מתעדכנים
```

---

## 5. Multi-Owner & Multi-Currency

| Owner | חשבונות | השקעות |
|-------|---------|--------|
| תומר | פועלים עו״ש, בינלאומי, מזרחי | פנסיה, קרן השתלמות |
| יעל | פועלים עו״ש, בינלאומי, בינלאומי שוטף | פנסיה, קרן השתלמות |
| משותף | דיסקונט, Chase×2 | תיק השקעות, מזומן (EUR/USD) |

**המרת מטבע:** כל ערך USD/EUR מוכפל ב-usdRate/eurRate בזמן ריצה. אין שמירה של ערך ממיר.

---

## 6. Missing Structure / Duplication Risks

### בעיות קיימות
| בעיה | תיאור | סיכון |
|------|--------|-------|
| **אין schema רשמי** | אין validation מרכזי — כל component מניח צורת נתון | קלסה שקטה אם שדה חסר |
| **FutureIncome vs RentalIncome** | שניהם "הכנסה" אבל מבנה שונה לגמרי | כפילות לוגיקה בcalculations.js |
| **noBalanceEffect flag** | קיים בRentalIncome ובExpenses, לא תמיד ברור מתי להפעיל | שגיאות חישוב |
| **monthlyAmounts** | override לסכום חודשי רק בExpenses — לא בRentalIncome | חוסר אחידות |
| **Investment עם currency=EUR/USD** | value=0, מחשב מoriginalAmount×rate — לא ברור מהקוד | בלבול בעריכה |
| **שערי חליפין ידניים** | liveLiveRates.js קיים אבל לא פעיל | תמיד מאחר |
| **Loan.startDate=null** | מונע חישוב יתרה — מוצג כ"missing" בלי אזהרה למשתמש | חישוב שגוי |
| **QuickAddModal (35KB)** | קומפוננט ענק עם כל הפעולות — קשה לתחזוקה | bug-prone |
| **Dashboard.jsx (1473 שורות)** | כל הלוגיקה במקום אחד | קשה לתחזוקה |

### כפילויות
- `getMonthEvents` ו-`getUpcomingEvents` — לוגיקה חופפת
- חישוב USD בכל מקום ידנית — אין helper מרכזי `toILS(amount, currency, rates)`

---

## 7. Proposed Clean Architecture

```
src/
├── entities/          ← טיפוסים + factory functions (אין כרגע)
│   ├── account.js
│   ├── loan.js
│   ├── income.js
│   └── ...
├── store/
│   ├── useStore.js    ← קיים (מונוליתי)
│   └── slices/        ← אפשרות עתידית: חלוקה לslices
├── utils/
│   ├── calculations.js ← קיים
│   ├── formatters.js   ← קיים
│   └── currency.js     ← חסר: toILS(amount, currency, rates)
├── pages/             ← קיים
├── components/
│   ├── modals/        ← לפצל מQuickAddModal הענק
│   └── ...
└── lib/               ← קיים
```

**עקרונות מנחים:**
1. כל חישוב כספי עובר דרך `calculations.js` — לא inline בקומפוננט
2. המרת מטבע תמיד דרך helper אחד
3. שדות חובה של entity מוגדרים במקום אחד
