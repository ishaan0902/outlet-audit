const BASE_URL = import.meta.env.VITE_API_URL || '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const r = await fetch(`${BASE_URL}${path}`, opts)
  if (r.status === 204) return null
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail || 'Request failed')
  return data
}

export const getAudits    = ()           => request('GET',    '/audits')
export const getAudit     = (id)         => request('GET',    `/audits/${id}`)
export const createAudit  = (data)       => request('POST',   '/audits', data)
export const updateAudit  = (id, data)   => request('PUT',    `/audits/${id}`, data)
export const deleteAudit  = (id)         => request('DELETE', `/audits/${id}`)
