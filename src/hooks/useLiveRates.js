import { useEffect } from 'react'
import useStore from '../store/useStore'

async function fetchRate(currency) {
  const res  = await fetch(`https://www.boi.org.il/PublicApi/GetExchangeRates?key=${currency}`)
  const data = await res.json()
  const entry = data?.exchangeRates?.find(r =>
    r.key?.toUpperCase() === currency.toUpperCase()
  )
  const rate = entry?.currentExchangeRate ?? null
  if (rate != null && (rate < 2 || rate > 8)) return null
  return rate
}

const monthKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

/**
 * שולף שערי יורו ודולר מבנק ישראל.
 * מתרענן פעם אחת בכל 1 לחודש.
 */
export default function useLiveRates() {
  const { ratesLastFetched, setEurRate, setUsdRate, setRatesLastFetched } = useStore()

  useEffect(() => {
    const now         = Date.now()
    const lastMonth   = ratesLastFetched ? monthKey(ratesLastFetched) : null
    const currentMonth = monthKey(now)

    if (lastMonth === currentMonth) return // כבר עודכן החודש

    Promise.all([fetchRate('EUR'), fetchRate('USD')])
      .then(([eur, usd]) => {
        if (eur) setEurRate(eur)
        if (usd) setUsdRate(usd)
        setRatesLastFetched(now)
      })
      .catch(() => {})
  }, [])
}
