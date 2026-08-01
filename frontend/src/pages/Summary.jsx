import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAudit, updateAudit } from '../api'
import { scoreClass, fmt, fmtDate, calcParamScore, calcOverallScore } from '../utils'

export default function Summary() {
  const { id } = useParams(); const nav = useNavigate()
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [id])
  async function load() {
    try { setAudit(await getAudit(id)) }
    catch { alert('Failed'); nav('/') }
    finally { setLoading(false) }
  }

  function getFlags() {
    if (!audit) return []
    return audit.parameters.flatMap(p =>
      p.checkpoints.filter(cp => cp.status === 'Fail').map(cp => ({ param: p.name, checkpoint: cp.name, notes: cp.notes, photos: cp.photos || [] }))
    )
  }

  function buildText() {
    const overall = calcOverallScore(audit.parameters)
    const lines = [
      'OUTLET AUDIT REPORT', '===================',
      `Outlet:  ${audit.outlet_name}`, `Brand:   ${audit.brand}`,
      `Auditor: ${audit.auditor_name}`, `Date:    ${fmtDate(audit.created_at)}`,
      `Score:   ${fmt(overall)}`, '', 'PARAMETER SCORES', '----------------',
      ...audit.parameters.map(p => `${p.name}: ${fmt(calcParamScore(p.checkpoints))}`),
    ]
    const flags = getFlags()
    if (flags.length) {
      lines.push('', `RED FLAGS (${flags.length})`, '------------')
      flags.forEach(f => { lines.push(`[${f.param}] ${f.checkpoint}`); if (f.notes) lines.push(`  Note: ${f.notes}`) })
    } else lines.push('', 'No failed checkpoints.')
    return lines.join('\n')
  }

  async function copySummary() {
    try { await navigator.clipboard.writeText(buildText()); setCopied(true); setTimeout(() => setCopied(false), 2500) }
    catch { alert('Could not copy') }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!audit) return null

  const overall = calcOverallScore(audit.parameters)
  const sc = scoreClass(overall)
  const flags = getFlags()

  const heroBg = {
    green: 'linear-gradient(135deg, #edf7f1 0%, #f5fdf8 100%)',
    amber: 'linear-gradient(135deg, #fdf3e0 0%, #fffaf0 100%)',
    red:   'linear-gradient(135deg, #fdf0ee 0%, #fff5f5 100%)',
    none:  'linear-gradient(135deg, #f5f0e8 0%, var(--bg) 100%)',
  }[sc]

  const heroBlobColor = {
    green: 'rgba(30,126,69,0.12)',
    amber: 'rgba(184,122,26,0.14)',
    red:   'rgba(192,57,43,0.12)',
    none:  'rgba(160,128,96,0.1)',
  }[sc]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="app-header-wrap no-print">
        <div className="header-inner">
          <button className="btn btn-ghost" style={{ padding: '7px 14px', minHeight: 34 }} onClick={() => nav('/')}>← Home</button>
          <span style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--text)' }}>Audit Report</span>
          <button className="btn btn-ghost" style={{ padding: '7px 14px', minHeight: 34 }}
            onClick={async () => { await updateAudit(id, { status: 'in-progress' }); nav(`/audit/${id}`) }}>
            Edit
          </button>
        </div>
      </div>

      <div className="page" id="print-area">
        {/* Score hero */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: 'var(--radius-lg)',
          background: heroBg,
          border: '1px solid var(--border)',
          padding: '24px 20px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 180, height: 180, borderRadius: '50%',
            background: `radial-gradient(circle, ${heroBlobColor} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <span className="label-tag" style={{ marginBottom: 16, display: 'inline-flex' }}>Audit Complete ✓</span>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16 }}>
            <div>
              <div className={`score-big ${sc}`}>{fmt(overall)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginTop: 4, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Overall Score</div>
            </div>
            <div style={{ flex: 1, paddingBottom: 6 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 4 }}>{audit.outlet_name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--caramel)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{audit.brand}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>{audit.auditor_name}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{fmtDate(audit.created_at)}</div>
            </div>
          </div>

          {/* Score fill bar */}
          <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 'var(--radius-pill)', height: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${overall ?? 0}%`,
              borderRadius: 'var(--radius-pill)',
              background: sc === 'green' ? 'var(--green)' : sc === 'amber' ? 'var(--amber-c)' : 'var(--red)',
              transition: 'width 1s ease',
            }} />
          </div>
        </div>

        {/* Red flags */}
        <div style={{ margin: '16px 16px 0', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{
            padding: '12px 16px',
            background: flags.length > 0 ? 'var(--red-bg)' : 'var(--green-bg)',
            borderBottom: `1px solid ${flags.length > 0 ? 'var(--red-bdr)' : 'var(--green-bdr)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: flags.length > 0 ? 'var(--red)' : 'var(--green)' }}>
              {flags.length > 0 ? `⚠ ${flags.length} Red Flag${flags.length !== 1 ? 's' : ''}` : '✓ Zero Red Flags'}
            </span>
            {flags.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>All clear!</span>}
          </div>
          {flags.map((f, i) => (
            <div className="flag-item" key={i} style={{ borderRadius: 0 }}>
              <div className="flag-param">{f.param}</div>
              <div className="flag-checkpoint">{f.checkpoint}</div>
              {f.notes && <div className="flag-note">"{f.notes}"</div>}
              {f.photos.length > 0 && <div className="flag-photos">{f.photos.map((p, pi) => <img key={pi} src={p} alt="" />)}</div>}
            </div>
          ))}
        </div>

        {/* Parameter breakdown */}
        <div style={{ margin: '16px 16px 0', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="divider-label" style={{ borderRadius: 0 }}>
            <span>Parameter Breakdown</span>
            <span style={{ marginLeft: 'auto' }}>{audit.parameters.length} sections</span>
          </div>
          {audit.parameters.map((p, i) => {
            const s = calcParamScore(p.checkpoints)
            const passes = p.checkpoints.filter(c => c.status === 'Pass').length
            const fails  = p.checkpoints.filter(c => c.status === 'Fail').length
            const nas    = p.checkpoints.filter(c => c.status === 'N/A').length
            return (
              <div className="summary-param" key={i}>
                <div>
                  <div className="summary-param-name">{p.name}</div>
                  <div className="summary-param-sub">
                    <span style={{ color: 'var(--green)' }}>{passes}P</span>
                    {' · '}
                    <span style={{ color: fails > 0 ? 'var(--red)' : 'var(--text3)' }}>{fails}F</span>
                    {' · '}
                    <span>{nas} N/A</span>
                  </div>
                </div>
                <span className={`score-chip ${scoreClass(s)}`}>{fmt(s)}</span>
              </div>
            )
          })}
        </div>

        {/* Export */}
        <div style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }} className="no-print">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => window.print()}>🖨 Export as PDF</button>
          <button className="btn btn-secondary btn-block" style={{ minHeight: 46 }} onClick={copySummary}>
            {copied ? '✓ Copied to clipboard!' : '📋 Copy Summary for WhatsApp'}
          </button>
        </div>
        <div style={{ height: 32 }} />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .app-header-wrap { display: none !important; }
          .bottom-bar { display: none !important; }
        }
      `}</style>
    </div>
  )
}
