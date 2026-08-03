// Google Apps Script Web App URL — set VITE_SCRIPT_URL in Vercel env vars
const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || ''

async function get(params = {}) {
  const url = new URL(SCRIPT_URL)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const r = await fetch(url.toString())
  const data = await r.json()
  if (data.error) throw new Error(data.error)
  return data
}

async function post(body) {
  const r = await fetch(SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = await r.json()
  if (data.error) throw new Error(data.error)
  return data
}

export const getAudits = () => get()
export const getAudit = (id) => get({ action: 'get', id })
export const createAudit = (data) => post({ action: 'create', data })
export const updateAudit = (id, data) => post({ action: 'update', id, data })
export const deleteAudit = (id) => post({ action: 'delete', id })
