import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import DefaultLayout from './layout/DefaultLayout'
import AuthLayout from './layout/AuthLayout'
import SignIn from './pages/Authentication/SignIn'
import TwoFactor from './pages/Authentication/TwoFactor'
import ChangePassword from './pages/Authentication/ChangePassword'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import UsersPage from './pages/Users'
import CajaPage from './pages/Caja'
import InventarioPage from './pages/Inventario'
import AuditoriaPage from './pages/Auditoria'
import NotFound from './pages/NotFound'
import './App.css'

function IndexRedirect() {
  const { session } = useAuth()
  if (session?.usuario?.sigla_rol === 'CAJ') {
    return <Navigate to="/caja" replace />
  }
  return <Navigate to="/dashboard" replace />
}

function ProtectedDashboard() {
  const { session } = useAuth()
  if (session?.usuario?.sigla_rol === 'CAJ') {
    return <Navigate to="/caja" replace />
  }
  return <Dashboard />
}

function ProtectedCaja() {
  const { session } = useAuth()
  if (session?.usuario?.sigla_rol === 'OPE') {
    return <Navigate to="/dashboard" replace />
  }
  return <CajaPage />
}

function ProtectedInventario() {
  const { session } = useAuth()
  if (session?.usuario?.sigla_rol === 'CAJ') {
    return <Navigate to="/caja" replace />
  }
  return <InventarioPage />
}

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthLayout />}>
        <Route path="login" element={<SignIn />} />
        <Route path="verify-2fa" element={<TwoFactor />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

      <Route element={<DefaultLayout />}>
        <Route index element={<IndexRedirect />} />
        <Route path="/dashboard" element={<ProtectedDashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/caja" element={<ProtectedCaja />} />
        <Route path="/inventario" element={<ProtectedInventario />} />
        <Route path="/auditoria" element={<AuditoriaPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
