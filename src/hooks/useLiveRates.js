import { useEffect } from 'react'
import useStore from '../store/useStore'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function fetchRate(currency) {
  const res  = await fetch(`https://www.boi.org.il/PublicApi/GetExchangeRates?key=${currency}`)
  const data = await res.json()
  return data?.exchangeRates?.[0]?.currentExchangeRate ?? null
}

/**
 * שולף שערי יורו ודולר מבנק ישראל.
 * מתרענן רק אם עברו יותר מ-7 ימים מהעדכון האחרון.
 */
export default function useLiveRates() {
  const { ratesLastFetched, setEurRate, setUsdRate, setRatesLastFetched } = useStore()

  useEffect(() => {
    const now     = Date.now()
    const elapsed = ratesLastFetched ? now - ratesLastFetched : Infinity

    if (elapsed < SEVEN_DAYS_MS) return // עדיין טרי

    Promise.all([fetchRate('EUR'), fetchRate('USD')])
      .then(([eur, usd]) => {
        if (eur) setEurRate(eur)
        if (usd) setUsdRate(usd)
        setRatesLastFetched(now)
      })
      .catch(() => {}) // נפילה שקטה — ישארו השערים האחרונים
  }, [])
}
