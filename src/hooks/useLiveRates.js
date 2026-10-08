import { useEffect } from 'react'
import useStore from '../store/useStore'

async function fetchRates() {
  const res  = await fetch('https://open.er-api.com/v6/latest/ILS')
  const data = await res.json()
  if (data?.result !== 'success') return null
  const rates = data.rates
  const usd = rates?.USD ? 1 / rates.USD : null
  const eur = rates?.EUR ? 1 / rates.EUR : null
  const all = {}
  for (const [code, r] of Object.entries(rates || {})) {
    if (r > 0) all[code] = Math.round((1 / r) * 1e6) / 1e6
  }
  return { usd, eur, all }
}

const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * שולף שערי יורו ודולר. מתרענן פעם אחת ביום.
 */
export default function useLiveRates() {
  const { ratesLastFetched, setEurRate, setUsdRate, setRates, setRatesLastFetched } = useStore()

  useEffect(() => {
    const now        = Date.now()
    const lastDay    = ratesLastFetched ? dayKey(ratesLastFetched) : null
    const currentDay = dayKey(now)

    if (lastDay === currentDay) return // כבר עודכן היום

    fetchRates()
      .then((rates) => {
        if (!rates) return
        if (rates.eur) setEurRate(Math.round(rates.eur * 10000) / 10000)
        if (rates.usd) setUsdRate(Math.round(rates.usd * 10000) / 10000)
        if (rates.all && Object.keys(rates.all).length) setRates(rates.all)
        setRatesLastFetched(now)
      })
      .catch(() => {})
  }, [ratesLastFetched])
}
