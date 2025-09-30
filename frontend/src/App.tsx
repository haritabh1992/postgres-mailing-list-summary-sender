import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { UnsubscribePage } from './pages/UnsubscribePage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/confirm" element={<ConfirmationPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
      </Routes>
    </Router>
  )
}

export default App
