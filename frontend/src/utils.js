export function scoreClass(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 85) return 'green'
  if (score >= 70) return 'amber'
  return 'red'
}

export function fmt(score) {
  if (score === null || score === undefined) return '--'
  return Math.round(score) + '%'
}

export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export async function compressImage(file, maxWidth = 800) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export function calcParamScore(checkpoints) {
  const passes = checkpoints.filter(c => c.status === 'Pass').length
  const fails = checkpoints.filter(c => c.status === 'Fail').length
  const total = passes + fails
  if (total === 0) return null
  return Math.round((passes / total) * 100 * 10) / 10
}

export function calcOverallScore(parameters) {
  const scores = parameters.map(p => calcParamScore(p.checkpoints)).filter(s => s !== null)
  if (!scores.length) return null
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

const LAST_AUDITOR_KEY = 'outlet_audit_last_auditor'
export const getLastAuditor = () => localStorage.getItem(LAST_AUDITOR_KEY) || ''
export const setLastAuditor = (name) => localStorage.setItem(LAST_AUDITOR_KEY, name)

const LAST_BRAND_KEY = 'outlet_audit_last_brand'
export const getLastBrand = () => localStorage.getItem(LAST_BRAND_KEY) || ''
export const setLastBrand = (b) => localStorage.setItem(LAST_BRAND_KEY, b)
