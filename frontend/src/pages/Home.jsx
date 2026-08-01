import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAudits, deleteAudit } from '../api'
import { scoreClass, fmt, fmtDate } from '../utils'

export default function Home() {
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const nav = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    try { setAudits(await getAudits()) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this audit?')) return
    setDeleting(id)
    try {
      await deleteAudit(id)
      setAudits(prev => prev.filter(a => a.id !== id))
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  const completed = audits.filter(a => a.status === 'completed' && a.overall_score != null)
  const inProgress = audits.filter(a => a.status === 'in-progress')
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, a) => s + a.overall_score, 0) / completed.length)
    : null

  function scoreColor(s) {
    if (s == null) return 'var(--text3)'
    if (s >= 85) return 'var(--green)'
    if (s >= 70) return 'var(--amber-c)'
    return 'var(--red)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div className="app-header-wrap">
        <div className="header-inner">
          <span className="header-logo">Outlet Audit</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 500 }}>
            {audits.length} audit{audits.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="page">
        {/* Hero banner — warm parchment with caramel tones */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #fdf0d8 0%, #faf5ec 50%, #eef5ee 100%)',
          border: '1px solid var(--border)',
          padding: '24px 20px 20px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(60,35,10,0.08)',
        }}>
          {/* Decorative blobs */}
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(184,122,26,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -20, left: 10,
            width: 100, height: 100, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(30,126,69,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <span className="label-tag" style={{ marginBottom: 14, display: 'inline-flex' }}>
            🍪 Operations
          </span>

          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.8rem, 7vw, 2.6rem)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--text)',
            marginBottom: 6,
          }}>
            Surprise Audits,<br />
            <span style={{ color: 'var(--caramel)' }}>Done Right.</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
            12 parameters · 60+ checkpoints · photo evidence
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[
              { val: audits.length, label: 'Total' },
              { val: inProgress.length, label: 'Live' },
              { val: avgScore != null ? avgScore + '%' : '--', label: 'Avg Score', color: scoreColor(avgScore) },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1,
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                backdropFilter: 'blur(4px)',
              }}>
                <div style={{
                  fontSize: 'clamp(1.3rem, 5vw, 1.8rem)',
                  fontWeight: 700,
                  fontFamily: 'var(--font-serif)',
                  letterSpacing: '-0.02em',
                  color: s.color || 'var(--text)',
                  lineHeight: 1,
                }}>{s.val}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontWeight: 600, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => nav('/new')}
          >
            + Start New Audit
          </button>
        </div>

        {/* Audit list */}
        <div style={{ margin: '20px 0 0' }}>
          {audits.length > 0 && (
            <div className="divider-label">
              <span>Recent Audits</span>
              <span style={{ marginLeft: 'auto' }}>{audits.length}</span>
            </div>
          )}

          {loading ? (
            <div className="loading">Loading audits…</div>
          ) : audits.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: '2.5rem', opacity: 0.25 }}>🍪</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--text2)' }}>
                No audits yet
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
                Your completed audits will appear here
              </div>
            </div>
          ) : (
            audits.map(audit => (
              <div
                key={audit.id}
                className="audit-card"
                onClick={() => audit.status === 'completed' ? nav(`/summary/${audit.id}`) : nav(`/audit/${audit.id}`)}
              >
                <div className="audit-card-body">
                  <div className="audit-card-name">{audit.outlet_name}</div>
                  <div className="audit-card-meta">
                    <span className="audit-card-brand">{audit.brand}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border2)', display: 'inline-block' }} />
                    <span className="audit-card-date">{fmtDate(audit.created_at)}</span>
                  </div>
                  <div className="audit-card-meta" style={{ marginTop: 1 }}>
                    <span className="audit-card-auditor">{audit.auditor_name}</span>
                    <span className={`status-badge ${audit.status}`}>
                      {audit.status === 'in-progress' ? 'In Progress' : 'Completed'}
                    </span>
                  </div>
                </div>
                <div className="audit-card-score">
                  <span className={`score-chip ${scoreClass(audit.overall_score)}`}>
                    {fmt(audit.overall_score)}
                  </span>
                  <button
                    onClick={e => handleDelete(e, audit.id)}
                    disabled={deleting === audit.id}
                    title="Delete"
                    style={{
                      fontSize: '0.7rem', color: 'var(--text3)', border: '1px solid var(--border)',
                      borderRadius: '50%', background: 'none', width: 28, height: 28, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {deleting === audit.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
