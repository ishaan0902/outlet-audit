import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAudit } from '../api'
import { getLastAuditor, setLastAuditor, getLastBrand, setLastBrand } from '../utils'

const BRANDS = ['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E', 'Other']

export default function NewAudit() {
  const nav = useNavigate()
  const [outlet, setOutlet] = useState('')
  const [brand, setBrand] = useState(getLastBrand())
  const [auditor, setAuditor] = useState(getLastAuditor())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!outlet.trim()) { setError('Outlet name is required'); return }
    if (!brand.trim())  { setError('Please select a brand'); return }
    if (!auditor.trim()){ setError('Auditor name is required'); return }
    setLoading(true); setError('')
    try {
      const audit = await createAudit({ outlet_name: outlet.trim(), brand: brand.trim(), auditor_name: auditor.trim() })
      setLastAuditor(auditor.trim()); setLastBrand(brand.trim())
      nav(`/audit/${audit.id}`)
    } catch {
      setError('Could not connect to the server. Make sure the backend is running.')
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="app-header-wrap">
        <div className="header-inner">
          <button className="btn btn-ghost" style={{ padding: '7px 14px', minHeight: 34 }} onClick={() => nav('/')}>
            ← Back
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--text)' }}>
            New Audit
          </span>
          <div style={{ width: 70 }} />
        </div>
      </div>

      <div className="page">
        {/* Heading */}
        <div style={{
          padding: '28px 20px 24px',
          background: 'linear-gradient(180deg, #fdf0d8 0%, var(--bg) 100%)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span className="label-tag" style={{ marginBottom: 12, display: 'inline-flex' }}>Surprise Audit</span>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.8rem, 8vw, 2.8rem)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--text)',
          }}>
            Set the scene<br />
            <span style={{ color: 'var(--caramel)' }}>before you begin.</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: 10 }}>
            12 parameters · All checkpoints scored · Export ready
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label>Outlet Name</label>
              <input type="text" value={outlet} onChange={e => setOutlet(e.target.value)} placeholder="e.g. Bandra West Outlet" autoFocus />
            </div>
            <div className="form-group">
              <label>Brand</label>
              <select value={brand} onChange={e => setBrand(e.target.value)}>
                <option value="">Select brand…</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Your Name</label>
              <input type="text" value={auditor} onChange={e => setAuditor(e.target.value)} placeholder="Auditor name" />
            </div>

            {error && (
              <div style={{
                background: 'var(--red-bg)', border: '1px solid var(--red-bdr)',
                borderRadius: 'var(--radius)', padding: '12px 14px',
                fontSize: '0.82rem', color: 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Creating audit…' : 'Begin Audit →'}
            </button>
          </div>
        </form>

        <div style={{ padding: '4px 16px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['📋 12 Parameters', '📸 Photo Evidence', '📊 Auto Scoring', '🖨 PDF Export'].map((tag, i) => (
            <span key={i} style={{
              fontSize: '0.72rem', fontWeight: 500, color: 'var(--text3)',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)', padding: '4px 12px',
            }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
