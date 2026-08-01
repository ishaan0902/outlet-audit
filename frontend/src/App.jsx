import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NewAudit from './pages/NewAudit'
import AuditFlow from './pages/AuditFlow'
import Summary from './pages/Summary'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<NewAudit />} />
      <Route path="/audit/:id" element={<AuditFlow />} />
      <Route path="/summary/:id" element={<Summary />} />
    </Routes>
  )
}
