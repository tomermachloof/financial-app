import { useEffect } from 'react'
import useStore from '../store/useStore'

async function fetchRates() {
  const res  = await fetch('https://open.er-api.com/v6/latest/ILS')
  const data = await res.json()
  if (data?.result !== 'success') return null
  const rates = data.rates
  const usd = rates?.USD ? 1 / rates.USD : null
  const eur = rates?.EUR ? 1 / rates.EUR : null
  return { usd, eur }
}

const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * שולף שערי יורו ודולר. מתרענן פעם אחת ביום.
 */
export default function useLiveRates() {
  const { ratesLastFetched, setEurRate, setUsdRate, setRatesLastFetched } = useStore()

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
        setRatesLastFetched(now)
      })
      .catch(() => {})
  }, [ratesLastFetched])
}
