/**
 * חישוב מרחק מהבית לכתובת נתונה — דרך שרת הקלאודפלר
 */

const WORKER_URL = 'https://financial-notify.tomer-finance.workers.dev'
const HOME_ADDRESS = 'משה וילנסקי 55, תל אביב, ישראל'

/**
 * מחשב מרחק בק"מ מהבית לכתובת שהתקבלה.
 * מחזיר { distanceKm, distanceText, isAboveThreshold } או null אם נכשל.
 */
export async function calcDistanceFromHome(destination) {
  if (!destination || destination.trim().length < 3) return null

  try {
    const params = new URLSearchParams({ destination: destination.trim(), home: HOME_ADDRESS })
    const res = await fetch(`${WORKER_URL}/distance?${params}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
