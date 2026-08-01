import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: BASE })

export const getAudits = () => api.get('/api/audits').then(r => r.data)
export const createAudit = (data) => api.post('/api/audits', data).then(r => r.data)
export const getAudit = (id) => api.get(`/api/audits/${id}`).then(r => r.data)
export const updateAudit = (id, data) => api.put(`/api/audits/${id}`, data).then(r => r.data)
export const deleteAudit = (id) => api.delete(`/api/audits/${id}`)
