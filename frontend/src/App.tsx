import { Routes, Route } from 'react-router-dom'
import { Web3Provider } from './providers/Web3Provider'
import { Layout } from './components/layout/Layout'
import { HomePage } from './pages/HomePage'
import { EmployerPage } from './pages/EmployerPage'
import { EmployeePage } from './pages/EmployeePage'
import { Toaster } from './components/ui/sonner'

function App() {
  return (
    <Web3Provider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/employer" element={<EmployerPage />} />
          <Route path="/employee" element={<EmployeePage />} />
        </Routes>
      </Layout>
      <Toaster richColors />
    </Web3Provider>
  )
}

export default App
