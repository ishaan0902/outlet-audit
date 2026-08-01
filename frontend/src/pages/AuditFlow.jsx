import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAudit, updateAudit } from '../api'
import { scoreClass, fmt, calcParamScore, calcOverallScore, compressImage } from '../utils'

function CheckpointRow({ cp, onChange, onAddPhoto, onRemovePhoto, onRemove }) {
  const fileRef = useRef()
  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return
    onAddPhoto(await compressImage(file)); e.target.value = ''
  }
  const rowClass = `checkpoint-row${cp.status === 'Fail' ? ' is-fail' : cp.status === 'Pass' ? ' is-pass' : ' is-na'}`
  return (
    <div className={rowClass}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
        <div className="checkpoint-name" style={{ margin: 0 }}>{cp.name}</div>
        <button type="button" onClick={onRemove}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 4px', flexShrink: 0, marginTop: 2 }}>
          ✕
        </button>
      </div>
      <div className="cp-toggle">
        <button type="button" className={`pass${cp.status === 'Pass' ? ' active' : ''}`} onClick={() => onChange({ ...cp, status: 'Pass' })}>✓ Pass</button>
        <button type="button" className={`fail${cp.status === 'Fail' ? ' active' : ''}`} onClick={() => onChange({ ...cp, status: 'Fail' })}>✕ Fail</button>
        <button type="button" className={`na${cp.status === 'N/A' ? ' active' : ''}`}    onClick={() => onChange({ ...cp, status: 'N/A' })}>N/A</button>
      </div>
      <div className="checkpoint-details">
        <textarea placeholder="Notes (optional)…" value={cp.notes} onChange={e => onChange({ ...cp, notes: e.target.value })} style={{ minHeight: 52, fontSize: '0.82rem' }} />
        <div>
          <label htmlFor={`ph-${cp.name}`} className="photo-upload-btn" style={{ display: 'inline-flex' }}>📷 Add Photo</label>
          <input id={`ph-${cp.name}`} ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
          {cp.photos?.length > 0 && (
            <div className="photo-grid">
              {cp.photos.map((p, i) => (
                <div className="photo-thumb" key={i}>
                  <img src={p} alt="" />
                  <button className="photo-thumb-remove" type="button" onClick={() => onRemovePhoto(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuditFlow() {
  const { id } = useParams(); const nav = useNavigate()
  const [audit, setAudit] = useState(null)
  const [paramIdx, setParamIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef(null)

  useEffect(() => { load() }, [id])
  async function load() {
    try { setAudit(await getAudit(id)) }
    catch { alert('Failed to load'); nav('/') }
    finally { setLoading(false) }
  }

  function updateCp(ci, newCp) {
    const updated = { ...audit, parameters: audit.parameters.map((p, pi) =>
      pi !== paramIdx ? p : { ...p, checkpoints: p.checkpoints.map((c, i) => i === ci ? newCp : c) }
    )}
    updated.parameters[paramIdx].score = calcParamScore(updated.parameters[paramIdx].checkpoints)
    updated.overall_score = calcOverallScore(updated.parameters)
    setAudit(updated); scheduleSave(updated)
  }
  function addPhoto(ci, photo) {
    const updated = { ...audit, parameters: audit.parameters.map((p, pi) =>
      pi !== paramIdx ? p : { ...p, checkpoints: p.checkpoints.map((c, i) =>
        i !== ci ? c : { ...c, photos: [...(c.photos || []), photo] }
      )}
    )}
    setAudit(updated); scheduleSave(updated)
  }
  function removePhoto(ci, pi) {
    const updated = { ...audit, parameters: audit.parameters.map((p, pIdx) =>
      pIdx !== paramIdx ? p : { ...p, checkpoints: p.checkpoints.map((c, i) =>
        i !== ci ? c : { ...c, photos: c.photos.filter((_, j) => j !== pi) }
      )}
    )}
    setAudit(updated); scheduleSave(updated)
  }
  function removeCp(ci) {
    if (!confirm('Remove this checkpoint?')) return
    const updated = { ...audit, parameters: audit.parameters.map((p, pi) =>
      pi !== paramIdx ? p : { ...p, checkpoints: p.checkpoints.filter((_, i) => i !== ci) }
    )}
    updated.parameters[paramIdx].score = calcParamScore(updated.parameters[paramIdx].checkpoints)
    updated.overall_score = calcOverallScore(updated.parameters)
    setAudit(updated); scheduleSave(updated)
  }
  function addCp() {
    const name = prompt('Checkpoint name:'); if (!name?.trim()) return
    const updated = { ...audit, parameters: audit.parameters.map((p, pi) =>
      pi !== paramIdx ? p : { ...p, checkpoints: [...p.checkpoints, { name: name.trim(), status: 'N/A', notes: '', photos: [] }] }
    )}
    setAudit(updated); scheduleSave(updated)
  }
  function scheduleSave(data) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(data), 1200)
  }
  async function save(data) {
    setSaving(true)
    try { await updateAudit(id, { parameters: data.parameters }) }
    catch (e) { console.error(e) }
    finally { setSaving(false) }
  }
  async function finish() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    try { await updateAudit(id, { parameters: audit.parameters, status: 'completed' }); nav(`/summary/${id}`) }
    catch { alert('Save failed'); setSaving(false) }
  }

  if (loading) return <div className="loading">Loading audit…</div>
  if (!audit) return null

  const param = audit.parameters[paramIdx]
  const total = audit.parameters.length
  const paramScore = calcParamScore(param.checkpoints)
  const overall = calcOverallScore(audit.parameters)
  const passes = param.checkpoints.filter(c => c.status === 'Pass').length
  const fails  = param.checkpoints.filter(c => c.status === 'Fail').length
  const nas    = param.checkpoints.filter(c => c.status === 'N/A').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="app-header-wrap">
        <div className="header-inner">
          <button className="btn btn-ghost" style={{ padding: '7px 14px', minHeight: 34 }}
            onClick={() => { if (saveTimer.current) clearTimeout(saveTimer.current); save(audit).then(() => nav('/')) }}>
            ✕ Exit
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
            {audit.outlet_name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saving && <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>saving…</span>}
            <span className={`score-chip ${scoreClass(overall)}`}>{fmt(overall)}</span>
          </div>
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${((paramIdx + 1) / total) * 100}%` }} />
      </div>
      <div className="progress-label">
        <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{paramIdx + 1} / {total} — {param.name}</span>
        <span style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--green)' }}>{passes}P</span>
          {fails > 0 && <span style={{ color: 'var(--red)' }}>{fails}F</span>}
          <span style={{ color: 'var(--text3)' }}>{nas} n/a</span>
        </span>
      </div>

      <div className="page">
        {/* Parameter header card */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, #fdf0d8 0%, #faf5ec 100%)',
          border: '1px solid var(--border)',
          padding: '18px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div>
            <span className="label-tag" style={{ marginBottom: 8, display: 'inline-flex' }}>
              {String(paramIdx + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
            </span>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)',
              fontWeight: 400,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}>
              {param.name}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Score</div>
            <span className={`score-chip ${scoreClass(paramScore)}`} style={{ fontSize: '0.88rem', padding: '5px 14px' }}>{fmt(paramScore)}</span>
          </div>
        </div>

        {/* Checkpoints card */}
        <div style={{ margin: '12px 16px 0', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {param.checkpoints.map((cp, ci) => (
            <CheckpointRow key={ci} cp={cp}
              onChange={newCp => updateCp(ci, newCp)}
              onAddPhoto={photo => addPhoto(ci, photo)}
              onRemovePhoto={pi => removePhoto(ci, pi)}
              onRemove={() => removeCp(ci)}
            />
          ))}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <button type="button" className="btn btn-ghost btn-block" style={{ borderStyle: 'dashed' }} onClick={addCp}>
              + Add Checkpoint
            </button>
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>

      <div className="bottom-bar">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={paramIdx === 0} onClick={() => setParamIdx(i => i - 1)}>← Back</button>
        {paramIdx < total - 1 ? (
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setParamIdx(i => i + 1)}>Next →</button>
        ) : (
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={finish}>
            {saving ? 'Saving…' : '✓ Complete Audit'}
          </button>
        )}
      </div>
    </div>
  )
}
