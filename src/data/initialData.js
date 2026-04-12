// ==========================================
// נתונים ראשוניים - תומר ויעל
// עודכן: ספטמבר 2024 — יש לעדכן יתרות!
// ==========================================

export const initialAccounts = [
  { id: 'ba1',  name: "עו\"ש תומר פועלים",      bank: 'פועלים',    balance: 4079,   owner: 'תומר', type: 'checking' },
  { id: 'ba2',  name: "עו\"ש תומר בינלאומי",    bank: 'בינלאומי',  balance: 5659,   owner: 'תומר', type: 'checking' },
  { id: 'ba3',  name: "תומר עסקי בינלאומי",     bank: 'בינלאומי',  balance: 111,    owner: 'תומר', type: 'business' },
  { id: 'ba4',  name: "עו\"ש יעל בינלאומי",     bank: 'בינלאומי',  balance: 3091,   owner: 'יעל',  type: 'checking' },
  { id: 'ba5',  name: "יעל עסקי בינלאומי",      bank: 'בינלאומי',  balance: 200,    owner: 'יעל',  type: 'business' },
  { id: 'ba6',  name: "עו\"ש יעל לאומי",        bank: 'לאומי',     balance: 31362,  owner: 'יעל',  type: 'checking' },
  { id: 'ba7',  name: "עו\"ש תומר לאומי",       bank: 'לאומי',     balance: 32,     owner: 'תומר', type: 'checking' },
  { id: 'ba8',  name: "עו\"ש תומר מזרחי",       bank: 'מזרחי',     balance: 4644,   owner: 'תומר', type: 'checking' },
  { id: 'ba9',  name: "דיסקונט תומר",           bank: 'דיסקונט',   balance: 1000,   owner: 'תומר', type: 'checking' },
  { id: 'ba10', name: "דיסקונט יעל",            bank: 'דיסקונט',   balance: 1000,   owner: 'יעל',  type: 'checking' },
  { id: 'ba11', name: "Chase Personal (...3398)", bank: 'Chase',    balance: 0, currency: 'USD', usdBalance: 991.44,  owner: 'יעל',  type: 'checking' },
  { id: 'ba12', name: "Chase Business (...1528)", bank: 'Chase',    balance: 0, currency: 'USD', usdBalance: 3522.39, owner: 'יעל',  type: 'business' },
]

export const initialInvestments = [
  // ── תומר — עדכני מדוח מרץ 2026 ──
  { id: 'inv1', name: "תיק השקעה בינלאומי",            value: 83000,   type: 'investment', owner: 'משותף' },
  { id: 'inv3', name: "חיסכון טהור פניקס תומר",        value: 323666,  type: 'pension',    owner: 'תומר'  },
  { id: 'inv5', name: "קרן השתלמות מור תומר",          value: 160694,  type: 'savings',    owner: 'תומר'  },
  { id: 'inv6', name: "קרן פנסיה פניקס תומר",          value: 10571,   type: 'pension',    owner: 'תומר'  },
  { id: 'inv9',  name: "קופת גמל להשקעה פניקס תומר",  value: 6218,  type: 'investment', owner: 'תומר'  },
  // ── יעל — עדכני מדוח פברואר 2026 ──
  { id: 'inv2',  name: "חיסכון טהור פניקס יעל",        value: 301269,  type: 'pension',    owner: 'יעל'   },
  { id: 'inv4',  name: "קרן השתלמות מור יעל",          value: 182269,  type: 'savings',    owner: 'יעל'   },
  { id: 'inv12', name: "קופת גמל אביגיל",              value: 7000,    type: 'savings',    owner: 'יעל'   },
  // ── כספים אצל אחרים (שער חי) ──
  { id: 'inv10', name: "גיא משה",  value: 0, type: 'cash', owner: 'משותף', currency: 'EUR', originalAmount: 123600 },
  { id: 'inv11', name: "שליו",     value: 0, type: 'cash', owner: 'משותף', currency: 'USD', originalAmount: 42000  },
]

// הלוואות — startDate: null = יש להשלים
// accountId = החשבון ממנו יורד התשלום (הוחלט: ראה הערות)
export const initialLoans = [
  {
    id: 'l1', name: "משכנתא אמא",
    totalAmount: 797000, balanceOverride: 640000, monthlyPayment: 7500,
    chargeDay: 15, durationMonths: 120,
    interestRate: null, interestType: 'fixed',
    startDate: null, owner: 'משותף', type: 'mortgage',
    // הוחלט: מחשבון מזרחי תומר | ₪7,500 − ₪3,100 שכ׳ סוקולוב = ₪4,400 בפועל
    creditAccountId: 'ba8', accountId: 'ba8', effectiveAmount: 4400,
    note: 'מזרחי | ₪4,400 בפועל (₪7,500 − ₪3,100 סוקולוב)',
  },
  {
    id: 'l2', name: "משכנתא אור יהודה",
    totalAmount: null, monthlyPayment: 5793,
    chargeDay: 15, durationMonths: null,
    interestRate: null, interestType: 'fixed',
    startDate: null, owner: 'משותף', type: 'mortgage',
    balanceOverride: 530361,
    creditAccountId: 'ba6', accountId: 'ba6', note: 'יעל לאומי',
  },
  {
    id: 'l3', name: "הלוואה לאומי יעל",
    totalAmount: 100000, monthlyPayment: 1920,
    chargeDay: 15, durationMonths: 60,
    interestRate: 6.0, interestType: 'fixed',
    startDate: '2021-11-18', owner: 'יעל', type: 'loan',
    creditAccountId: 'ba6', accountId: 'ba6', note: 'יעל לאומי',
  },
  {
    id: 'l4', name: "הלוואה פועלים מאי",
    totalAmount: 75000, monthlyPayment: 809,
    chargeDay: 12, durationMonths: 120,
    interestRate: 5.0, interestType: 'prime-0.5',
    startDate: '2021-11-07', owner: 'משותף', type: 'loan',
    creditAccountId: 'ba1', accountId: 'ba1', note: 'תומר פועלים',
  },
  {
    id: 'l5', name: "הלוואה קרן השתלמות מור תומר",
    totalAmount: 95200, monthlyPayment: 10790,
    chargeDay: 5, durationMonths: 9,
    interestRate: 4.8, interestType: 'prime-0.7',
    startDate: '2026-02-12', owner: 'תומר', type: 'loan',
    creditAccountId: 'ba2', accountId: 'ba2', note: 'תומר בינלאומי',
  },
  {
    id: 'l6', name: "יעל הלוואה קרן השתלמות מור",
    totalAmount: 106800, monthlyPayment: 3111,
    chargeDay: 5, durationMonths: 37,
    interestRate: 4.8, interestType: 'prime-0.7',
    startDate: '2026-02-12', owner: 'יעל', type: 'loan',
    creditAccountId: 'ba6', accountId: 'ba6', note: 'יעל לאומי',
  },
  {
    id: 'l7', name: "יעל הלוואה פניקס 1",
    totalAmount: 30000, monthlyPayment: 900,
    chargeDay: null, durationMonths: 36,
    interestRate: 5.0, interestType: 'prime-0.5',
    startDate: null, owner: 'יעל', type: 'loan',
    balanceOverride: 30000,
    creditAccountId: 'ba6', accountId: 'ba6', note: 'יעל לאומי',
  },
  {
    id: 'l8', name: "יעל הלוואה פניקס 2",
    totalAmount: 30000, monthlyPayment: 900,
    chargeDay: null, durationMonths: 36,
    interestRate: 5.0, interestType: 'prime-0.5',
    startDate: null, owner: 'יעל', type: 'loan',
    balanceOverride: 30000,
    creditAccountId: 'ba6', accountId: 'ba6', note: 'יעל לאומי',
  },
  {
    id: 'l9', name: "הלוואה תומר פניקס",
    totalAmount: 164000, monthlyPayment: 14040,
    chargeDay: 1, durationMonths: 12,
    interestRate: 5.0, interestType: 'prime-0.5',
    startDate: '2025-12-31', owner: 'תומר', type: 'loan',
    creditAccountId: 'ba2', accountId: 'ba2', note: 'תומר בינלאומי',
  },
  {
    id: 'l10', name: "יעל הלוואה דיסקונט",
    totalAmount: 30000, monthlyPayment: 833,
    chargeDay: 20, durationMonths: 36,
    interestRate: 0, interestType: 'fixed',
    startDate: '2026-03-20', owner: 'יעל', type: 'loan',
    creditAccountId: 'ba10', accountId: 'ba10', note: 'דיסקונט יעל',
  },
  {
    id: 'l11', name: "תומר הלוואה דיסקונט",
    totalAmount: 30000, monthlyPayment: 833,
    chargeDay: 20, durationMonths: 36,
    interestRate: 0, interestType: 'fixed',
    startDate: '2026-03-20', owner: 'תומר', type: 'loan',
    creditAccountId: 'ba9', accountId: 'ba9', note: 'דיסקונט תומר',
  },
  {
    id: 'l12', name: "עוגן 2",
    totalAmount: 40000, monthlyPayment: 666,
    chargeDay: 10, durationMonths: 60,
    interestRate: 0, interestType: 'fixed',
    startDate: '2024-02-28', owner: 'משותף', type: 'loan',
    creditAccountId: 'ba1', accountId: 'ba1', note: 'תומר פועלים',
  },
  {
    id: 'l15', name: "יוסף — טלפון",
    totalAmount: 1498.8, monthlyPayment: 62.45,
    chargeDay: 15, durationMonths: 24,
    interestRate: 0, interestType: 'fixed',
    startDate: '2025-08-15', owner: 'תומר', type: 'loan',
    currency: 'USD',
    creditAccountId: 'ba12', accountId: 'ba12', note: 'Chase Business',
  },
  {
    id: 'l16', name: "יוסף — קייס",
    totalAmount: 48.96, monthlyPayment: 4.08,
    chargeDay: 15, durationMonths: 12,
    interestRate: 0, interestType: 'fixed',
    startDate: '2025-08-15', owner: 'תומר', type: 'loan',
    currency: 'USD',
    creditAccountId: 'ba12', accountId: 'ba12', note: 'Chase Business',
  },
  {
    id: 'l17', name: "אליעזר — פועלים",
    totalAmount: 250000, monthlyPayment: 11082,
    chargeDay: 20, durationMonths: 24,
    interestRate: 6.0, interestType: 'prime+0.5',
    startDate: '2026-01-07', owner: 'תומר', type: 'loan',
    creditAccountId: 'ba1', accountId: 'ba1', note: 'תומר פועלים',
    paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2,
    balanceOverride: 230526,
    extras: [{ name: 'שעון', amount: 3700, remainingPayments: 7 }],
  },
  {
    id: 'l18', name: "אליעזר — בינלאומי",
    totalAmount: 200400, monthlyPayment: 13901,
    chargeDay: 1, durationMonths: 16,
    interestRate: 6.0, interestType: 'prime+0.5',
    startDate: '2026-01-16', owner: 'תומר', type: 'loan',
    creditAccountId: 'ba2', accountId: 'ba2', note: 'תומר בינלאומי',
    paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2,
    balanceOverride: 188251,
  },
]

// הוצאות קבועות (לא הלוואות)
// accountId = החשבון ממנו יורד התשלום
export const initialExpenses = [
  // כרטיסי אשראי — 3 כרטיסים נפרדים עם אפשרות לעדכון חודשי
  { id: 'e_cc1', name: "תומר פליי קארד",       amount: 20000, chargeDay: 10, category: 'credit', accountId: 'ba2', note: 'תומר בינלאומי', monthlyAmounts: {} },
  { id: 'e_cc2', name: "אמריקן אקספרס תומר",   amount: 1000,  chargeDay: 10, category: 'credit', accountId: 'ba2', note: 'תומר בינלאומי', monthlyAmounts: {} },
  { id: 'e_cc3', name: "יעל פליי קארד",         amount: 4000,  chargeDay: 10, category: 'credit', accountId: 'ba4', note: 'יעל בינלאומי',  monthlyAmounts: {} },
  { id: 'e_cc4', name: "כרטיס מזרחי",           amount: 3000,  chargeDay: 2,  category: 'credit', accountId: 'ba8', note: 'תומר מזרחי',    monthlyAmounts: {} },
  // רכב — גוהץ באשראי, לא מנכה מהחשבון ישירות
  { id: 'e2',  name: "רכב",               amount: 3100,  chargeDay: 19, category: 'transport', paidViaCredit: true, note: 'גוהץ באשראי — נכלל בחיוב ב-10' },
  { id: 'e3',  name: "רואה חשבון",        amount: 550,   chargeDay: null, category: 'business' },
  { id: 'e4',  name: "רוגובין",           amount: 4500,  chargeDay: 1,  category: 'business',  accountId: 'ba5', note: 'יעל עסקי בינלאומי' },
  { id: 'e5',  name: "שכירות בית",        amount: 10500, chargeDay: 24, category: 'rent',      accountId: 'ba2', note: 'תומר בינלאומי' },
  { id: 'e6',  name: "חשבונות בית",       amount: 2500,  chargeDay: null, category: 'utilities' },
  { id: 'e9',  name: "קופת גמל אביגיל",   amount: 1500,  chargeDay: 15, category: 'savings',   accountId: 'ba4', note: 'יעל בינלאומי' },
  { id: 'e7',  name: "שכירות West Knoll", amount: 0, usdAmount: 3300, currency: 'USD', chargeDay: 1, category: 'rent', accountId: 'ba12', note: 'Chase Business' },
  { id: 'e8',  name: "יוסף — טסלה וחשבונות", amount: 0, usdAmount: 1250, usdDeductions: '-$425 -$67', currency: 'USD', chargeDay: 1, category: 'transport', accountId: 'ba12', note: 'Chase Business' },
  { id: 'e10', name: "רונן רואה חשבון",   amount: 531,   chargeDay: 6,  category: 'business',  accountId: 'ba5', note: 'בינלאומי עסקי יעל' },
]

// הכנסות חוזרות (שכירויות)
// accountId = החשבון לתוכו נכנס הכסף
export const initialRentalIncome = [
  // שכירות סוקולוב — מקוזז ממשכנתא אמא, לא משפיע על יתרה
  { id: 'r1', name: "שכירות סוקולוב",   amount: 3100, chargeDay: 10, notes: '', noBalanceEffect: true, note: 'מקוזז ממשכנתא אמא | אין השפעה על יתרה' },
  { id: 'r2', name: "שכירות אור יהודה", amount: 6300, chargeDay: 1,  notes: '', accountId: 'ba6', note: 'יעל לאומי' },
  { id: 'r3', name: "אופיר שוכרת West Knoll", amount: 0, usdAmount: 3500, currency: 'USD', chargeDay: 30, notes: '', accountId: 'ba12', note: 'Chase Business' },
  { id: 'r4', name: "Omri Tesla",             amount: 0, usdAmount: 980,  currency: 'USD', chargeDay: 1,  notes: '', accountId: 'ba12', note: 'Chase Business' },
  { id: 'r5', name: "שליו ריבית",             amount: 0, usdAmount: 1050, currency: 'USD', chargeDay: 24, notes: '', accountId: 'ba12', note: 'Chase Business' },
  { id: 'r6', name: "קצבת ילדים",             amount: 173, chargeDay: 17, notes: '', accountId: 'ba4', note: 'יעל בינלאומי' },
]

// הכנסות עתידיות חד-פעמיות
export const initialFutureIncome = [
  { id: 'fi1',  name: "סלקום יעל — תשלום 1",          amount: 87500, expectedDate: '2026-05-01', status: 'pending', notes: 'מתוך 262,500 ₪ סה״כ' },
  { id: 'fi2',  name: "סלקום יעל — תשלום 2",          amount: 87500, expectedDate: '2026-07-01', status: 'pending', notes: '' },
  { id: 'fi3',  name: "סלקום יעל — תשלום 3",          amount: 87500, expectedDate: '2026-10-01', status: 'pending', notes: '' },
  { id: 'fi4',  name: "סימילק",                        amount: 42000, expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi5',  name: "בייבי סטאר",                   amount: 22000, expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi6',  name: "ניבאה",                         amount: 14000, expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi7',  name: "הבימה ינואר פברואר",            amount: 3800,  expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi8',  name: "גט",                            amount: 5000,  expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi9',  name: "סרט גדרה",                      amount: 1000,  expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi10', name: "סרט קצר יעל דאנה איבגי",        amount: 1000,  expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi11', name: "הקשב הרספ",                     amount: 1000,  expectedDate: null,         status: 'pending', notes: '' },
  { id: 'fi12', name: "ביטוח לאומי לידה",  amount: null, expectedDate: null, status: 'pending', notes: '' },
  { id: 'fi13', name: "טיפול זוגי",        amount: 0,    expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
  { id: 'fi14', name: "הקלטות ניצן",       amount: 0,    expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
  { id: 'fi15', name: "הטבח",              amount: 0,    expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
  { id: 'fi16', name: "תשלום לאמא — הלוואה + משכנתא", amount: -14325, expectedDate: '2026-05-01', status: 'pending', notes: 'ד6: 6,000 הלוואה + 7,500 משכנתא מרץ', isPayment: true },
]

// חובות בין-אישיים
export const initialDebts = [
  { id: 'd2', name: "ליאת מזומן", amount: 49000,  type: 'owed_to_us', expectedDate: null,         notes: '' },
  { id: 'd3_nursery', name: "פקדון משתלה", amount: 21000, type: 'owed_to_us', expectedDate: null, notes: '' },
  { id: 'd4', name: "בלבל",        amount: 20000,  type: 'we_owe',     expectedDate: null,         notes: '' },
  { id: 'd5', name: "אמא",         amount: 79700,  type: 'we_owe',     expectedDate: null,         notes: '63923+2700+2572+30000, -400 אורי' },
  { id: 'd6', name: "אמא — הלוואה 6000 + משכנתא מרץ", amount: 14325, type: 'we_owe', expectedDate: null, notes: '6,000 הלוואה + 7,500 משכנתא מרץ' },
]
