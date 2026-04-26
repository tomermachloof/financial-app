// ── ייצוא דיווח עבודה לסוכנות ──
// פותח חלון חדש עם עמוד מעוצב ומפעיל את תפריט ההדפסה של הדפדפן.
// בטלפון: המשתמש יכול לבחור "שמור כ-PDF" או "שיתוף" מהתפריט.
// ללא שום חישוב של עמלת סוכן / מע״מ — רק סכום גולמי.

import { formatDate } from '../utils/formatters'

// חישוב משך מדויק בין שני זמנים HH:MM → "X שעות ו-Y דקות" או "X שעות"
const exactDuration = (start, end) => {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h} שעות`
  return `${h} שעות ו-${m} דקות`
}

// פירוט טקסטואלי פשוט (לשימוש ברשימה רגילה)
const describeSession = (ws) => {
  if (!ws) return '—'
  const timeParts = []
  if (ws.shootStart && ws.shootEnd) {
    timeParts.push(`${ws.shootStart}–${ws.shootEnd}`)
    timeParts.push(exactDuration(ws.shootStart, ws.shootEnd))
  } else if (ws.dubbingStart && ws.dubbingEnd) {
    timeParts.push(`${ws.dubbingStart}–${ws.dubbingEnd}`)
    timeParts.push(exactDuration(ws.dubbingStart, ws.dubbingEnd))
  }
  if (ws.pickupTime) timeParts.push(`איסוף ${ws.pickupTime}`)
  if (ws.returnTime) timeParts.push(`חזור ${ws.returnTime}`)
  if (ws.manualMode) return timeParts.join(' · ') || '—'
  if (ws.type === 'יום צילום') {
    if (ws.travelHours) timeParts.push(`כולל נסיעות ${ws.travelHours}`)
    return timeParts.join(' · ') || '—'
  }
  if (ws.quantity && ws.ratePerUnit) timeParts.push(`${ws.quantity} × ₪${ws.ratePerUnit}`)
  return timeParts.join(' · ') || '—'
}

// פירוט עם צבעים לדוח סוכנות — מציג 4 שעות, צובע את אלה שמשמשות לחישוב
const describeSessionHtml = (ws) => {
  if (!ws) return '—'
  // manualMode — מציגים שעות אם קיימות, בלי כיתוב "סכום ידני"
  if (ws.manualMode) {
    const parts = []
    if (ws.shootStart && ws.shootEnd) {
      parts.push(`${ws.shootStart}–${ws.shootEnd}`)
      parts.push(exactDuration(ws.shootStart, ws.shootEnd))
    } else if (ws.dubbingStart && ws.dubbingEnd) {
      parts.push(`${ws.dubbingStart}–${ws.dubbingEnd}`)
      parts.push(exactDuration(ws.dubbingStart, ws.dubbingEnd))
    }
    if (ws.pickupTime) parts.push(`איסוף ${ws.pickupTime}`)
    if (ws.returnTime) parts.push(`חזור ${ws.returnTime}`)
    return parts.length > 0 ? parts.join('<br>') : '—'
  }
  if (ws.type === 'יום צילום') {
    const useTravel = !!ws.useTravelForCalc
    // צבע: ירוק = חישוב מהסט, כתום = חישוב מהבית (כולל נסיעות)
    const calcColor = useTravel ? '#d97706' : '#059669'
    const normalColor = '#6b7280'

    const pickupColor = useTravel ? calcColor : normalColor
    const shootColor  = useTravel ? normalColor : calcColor
    const returnColor = useTravel ? calcColor : normalColor

    const lines = []
    lines.push(`<span style="color:${pickupColor};font-weight:${useTravel ? '700' : '400'}">איסוף: ${ws.pickupTime || '—'}</span>`)
    lines.push(`<span style="color:${shootColor};font-weight:${!useTravel ? '700' : '400'}">תחילת צילום: ${ws.shootStart || '—'}</span>`)
    lines.push(`<span style="color:${shootColor};font-weight:${!useTravel ? '700' : '400'}">סיום צילום: ${ws.shootEnd || '—'}</span>`)
    lines.push(`<span style="color:${returnColor};font-weight:${useTravel ? '700' : '400'}">חזור: ${ws.returnTime || '—'}</span>`)

    // שורת סיכום שעות — מדויק מהזמנים
    if (useTravel && ws.pickupTime && ws.returnTime) {
      const dur = exactDuration(ws.pickupTime, ws.returnTime)
      if (dur) lines.push(`<span style="color:${calcColor};font-weight:700;font-size:11px;">${dur} (כולל נסיעות)</span>`)
    } else if (!useTravel && ws.shootStart && ws.shootEnd) {
      const dur = exactDuration(ws.shootStart, ws.shootEnd)
      if (dur) lines.push(`<span style="color:${calcColor};font-weight:700;font-size:11px;">${dur} (צילום)</span>`)
    }

    return lines.join('<br>')
  }
  if (ws.type === 'חזרות' || ws.type === 'מדידות' || ws.type === 'חזרה מסחרי' || ws.type === 'מדידות מסחרי') {
    const parts = []
    if (ws.shootStart && ws.shootEnd) {
      parts.push(`${ws.shootStart}–${ws.shootEnd}`)
      parts.push(exactDuration(ws.shootStart, ws.shootEnd))
    }
    return parts.length > 0 ? parts.join('<br>') : '—'
  }
  // Theater types
  if (ws.type === 'הצגה' || ws.type === 'חזרה אחרי עלייה' || ws.type === 'צילומי טריילר' || ws.type === 'צילומי הצגה') {
    const parts = []
    if (ws.theaterLocation) parts.push(`📍 ${ws.theaterLocation}`)
    if (ws.shootStart && ws.shootEnd) {
      parts.push(`${ws.shootStart}–${ws.shootEnd}`)
      parts.push(exactDuration(ws.shootStart, ws.shootEnd))
    }
    return parts.length > 0 ? parts.join('<br>') : ws.type
  }
  if (ws.type === 'חזרות חודשיות') return ws.theaterMonth || 'חודש'
  // Commercial / other with times
  if (ws.shootStart && ws.shootEnd) {
    const parts = [`${ws.shootStart}–${ws.shootEnd}`]
    if (ws.commercialNote) parts.push(ws.commercialNote)
    return parts.join('<br>')
  }
  // Dubbing
  if (ws.dubbingStart && ws.dubbingEnd) {
    const parts = [`${ws.dubbingStart}–${ws.dubbingEnd}`]
    parts.push(exactDuration(ws.dubbingStart, ws.dubbingEnd))
    return parts.join('<br>')
  }
  if (ws.quantity && ws.ratePerUnit) {
    return `${ws.quantity} × ₪${ws.ratePerUnit}`
  }
  return '—'
}

const ownerLabel = (owner) => {
  if (owner === 'tomer') return 'תומר מכלוף'
  if (owner === 'yael')  return 'יעל אלקנה'
  return 'לא צוין'
}

const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

// הפרמטר options.overrideSessions (אופציונלי) — רשימת רישומים לקחת מהטופס
// במקום מהפריט עצמו, כדי לכלול גם רישומים שטרם נשמרו לענן.
export function exportIncomeReport(item, cutoffDate, options = {}) {
  if (!item) return

  // סינון רישומים עד תאריך החיתוך כולל
  const cutoff = new Date(cutoffDate)
  cutoff.setHours(23, 59, 59, 999)
  const sourceSessions = Array.isArray(options.overrideSessions)
    ? options.overrideSessions
    : (item.sessions || [])
  const sessions = sourceSessions
    .filter(ws => {
      if (!ws.date) return true
      return new Date(ws.date) <= cutoff
    })
    // סידור לפי תאריך
    .slice()
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return da - db
    })

  // סך הכל גולמי — ללא עמלה ומע״מ
  // בפרויקט מסחרי הרישומים הם תיעוד בלבד (amount=0) — הסכום נמצא ב-item.amount
  const isCommercial = item.projectType === 'commercial'
  const total = isCommercial
    ? (item.amount || 0)
    : sessions.reduce((s, ws) => s + (ws.amount || 0), 0)

  // חישוב יתרה עדכנית — כבר התקבל ויתרה לתשלום
  // amount בתשלום החלקי הוא בבסיס (לפני עמלה ומע״מ), זה מה שמקזז את הפרויקט.
  const payments = item.payments || []
  const alreadyReceived = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const remaining = total - alreadyReceived

  const todayStr  = new Date().toLocaleDateString('he-IL')
  const cutoffStr = formatDate(cutoffDate)

  // בניית שורות הטבלה
  const rowsHtml = sessions.length > 0
    ? sessions.map((ws, i) => {
        const locClass = ws.setIsAboveThreshold ? 'location from-home' : 'location from-set'
        const locText = ws.setLocation
          ? `${escapeHtml(ws.setLocation)}${ws.setDistanceKm != null ? ` (${ws.setDistanceKm} ק״מ)` : ''}<br><span style="font-size:10px;">${ws.setIsAboveThreshold ? '🚗 מהבית' : '📍 מהסט'}</span>`
          : '—'
        return `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(ws.type || '—')}</td>
          <td>${escapeHtml(ws.date ? formatDate(ws.date) : 'ללא תאריך')}</td>
          <td class="${locClass}">${locText}</td>
          <td class="detail">${describeSessionHtml(ws)}</td>
          <td class="amount">${isCommercial ? '—' : `₪${(ws.amount || 0).toLocaleString()}`}</td>
        </tr>`
      }).join('')
    : `<tr><td colspan="6" class="empty">אין רישומים בתקופה הנבחרת</td></tr>`

  const safeName = escapeHtml(item.name || 'פרויקט')
  // כותרת המסמך — הדפדפן משתמש בזה כשם ברירת המחדל לקובץ PDF בשמירה
  // פורמט: "שם הבעלים - שם הפרויקט"
  const ownerName = ownerLabel(item.owner)
  const rawTitle = `${ownerName} - ${item.name || 'פרויקט'}`
  // תווים אסורים בשמות קבצים (חלון ההורדה מנקה חלק מהם אוטומטית, אך עדיף לעטוף)
  const docTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '')

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Arial, sans-serif;
      color: #222;
      background: #fff;
      margin: 0;
      padding: 32px 40px;
      direction: rtl;
    }
    .header {
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      color: #1e1b4b;
      margin: 0 0 4px 0;
    }
    .subtitle {
      font-size: 13px;
      color: #6b7280;
      margin: 0;
    }
    .info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
      margin: 20px 0 24px 0;
      padding: 16px 20px;
      background: #f9fafb;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
    }
    .info-row { font-size: 13px; }
    .info-label { color: #6b7280; font-weight: 600; }
    .info-value { color: #111827; font-weight: 700; margin-right: 6px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 13px;
    }
    thead th {
      background: #4f46e5;
      color: white;
      padding: 10px 12px;
      text-align: right;
      font-weight: 700;
    }
    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: right;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    td.num { text-align: center; color: #9ca3af; width: 40px; }
    td.amount { text-align: left; font-weight: 700; color: #059669; white-space: nowrap; }
    td.detail { color: #4b5563; }
    td.location { font-size: 11px; }
    td.location.from-home { color: #d97706; font-weight: 600; }
    td.location.from-set  { color: #059669; }
    td.empty { text-align: center; color: #9ca3af; padding: 24px; }
    .summary-box {
      margin-top: 24px;
      padding: 18px 24px;
      background: #eef2ff;
      border-right: 4px solid #4f46e5;
      border-radius: 8px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .summary-row + .summary-row { border-top: 1px dashed #c7d2fe; }
    .summary-row.total { padding-top: 12px; margin-top: 4px; border-top: 2px solid #4f46e5; }
    .summary-label { font-size: 13px; font-weight: 600; color: #4b5563; }
    .summary-value { font-size: 15px; font-weight: 700; color: #1e1b4b; }
    .summary-row.total .summary-label { font-size: 15px; color: #1e1b4b; font-weight: 800; }
    .summary-row.total .summary-value { font-size: 22px; font-weight: 800; color: #4f46e5; }
    .summary-row.received .summary-value { color: #059669; }
    .summary-row.remaining .summary-value { color: #d97706; }
    .note {
      margin-top: 10px;
      font-size: 11px;
      color: #6b7280;
      font-style: italic;
      text-align: left;
    }
    .footer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    .print-btn {
      position: fixed;
      top: 16px;
      left: 16px;
      background: #4f46e5;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    @media print {
      body { padding: 20px; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">📄 הדפס / שמור כ-PDF</button>

  <div class="header">
    <h1 class="title">דיווח עבודה לסוכנות</h1>
    <p class="subtitle">מסמך תיעוד ימי עבודה</p>
  </div>

  <div class="info">
    <div class="info-row"><span class="info-label">עבור:</span><span class="info-value">${escapeHtml(ownerLabel(item.owner))}</span></div>
    <div class="info-row"><span class="info-label">שם הפרויקט:</span><span class="info-value">${safeName}</span></div>
    <div class="info-row"><span class="info-label">תאריך הפקה:</span><span class="info-value">${escapeHtml(todayStr)}</span></div>
    <div class="info-row"><span class="info-label">תקופת דיווח:</span><span class="info-value">עד ${escapeHtml(cutoffStr)}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center;">#</th>
        <th>סוג</th>
        <th>תאריך</th>
        <th>מיקום</th>
        <th>פירוט</th>
        <th style="text-align:left;">סכום</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-row total">
      <span class="summary-label">סך הכל עבודה בתקופה</span>
      <span class="summary-value">₪${total.toLocaleString()}</span>
    </div>
    ${alreadyReceived > 0 ? `
    <div class="summary-row received">
      <span class="summary-label">כבר התקבל עד כה</span>
      <span class="summary-value">-₪${alreadyReceived.toLocaleString()}</span>
    </div>
    <div class="summary-row remaining">
      <span class="summary-label">יתרה לתשלום</span>
      <span class="summary-value">₪${remaining.toLocaleString()}</span>
    </div>
    ` : ''}
  </div>
  <p class="note">* הסכומים הנ״ל לא כוללים עמלת סוכן ומע״מ</p>

  <div class="footer">
    נוצר אוטומטית ממערכת ניהול ההכנסות
  </div>

  <script>
    // פותח את תפריט ההדפסה אוטומטית אחרי טעינה — ודואג שהחלון יהיה בפרונט
    // והכותרת מוגדרת רגע לפני ההדפסה (כרום לוקח ממנה את שם ברירת המחדל של הקובץ)
    window.addEventListener('load', () => {
      setTimeout(() => {
        document.title = ${JSON.stringify(docTitle)}
        try { window.focus() } catch {}
        window.print()
      }, 400)
    })
  </script>
</body>
</html>`

  // פתיחה דרך Blob URL — קריטי כדי שכרום יקרא את ה-<title> לשם ברירת המחדל
  // (עם document.write על about:blank כרום מתעלם מהכותרת ונופל חזרה ל-URL)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    URL.revokeObjectURL(url)
    alert('חסום חלון קופץ — אפשר חלונות קופצים לאתר הזה ונסה שוב')
    return
  }
  // מעלה את החלון לפרונט מעל האפליקציה
  try { w.focus() } catch {}
  // שחרור ה-URL אחרי שהדף נטען (חיסכון בזיכרון)
  setTimeout(() => { try { URL.revokeObjectURL(url) } catch {} }, 60 * 1000)
}
