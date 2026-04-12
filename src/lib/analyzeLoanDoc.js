const ANALYZE_URL = import.meta.env.VITE_ANALYZE_URL

export async function analyzeLoanDoc(file) {
  const base64 = await fileToBase64(file)
  const mediaType = getMediaType(file)

  const res = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { error: `שגיאה: ${res.status} — ${err}` }
  }

  const data = await res.json()
  if (data.error) return { error: data.error }
  return { ...data, error: null }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMediaType(file) {
  if (file.type === 'application/pdf') return 'application/pdf'
  if (file.type === 'image/png')  return 'image/png'
  if (file.type === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}
