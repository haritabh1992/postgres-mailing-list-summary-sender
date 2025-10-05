import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { UnsubscribePage } from './pages/UnsubscribePage'
import { ArchivePage } from './pages/ArchivePage'
import { SummaryDetailPage } from './pages/SummaryDetailPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/confirm" element={<ConfirmationPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/summary/:id" element={<SummaryDetailPage />} />
      </Routes>
    </Router>
  )
}

export default App
