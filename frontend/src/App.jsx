import { Routes, Route, Navigate } from 'react-router-dom'
import DefaultLayout from './layout/DefaultLayout'
import AuthLayout from './layout/AuthLayout'
import SignIn from './pages/Authentication/SignIn'
import TwoFactor from './pages/Authentication/TwoFactor'
import ChangePassword from './pages/Authentication/ChangePassword'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import UsersPage from './pages/Users'
import CajaPage from './pages/Caja'
import NotFound from './pages/NotFound'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthLayout />}>
        <Route path="login" element={<SignIn />} />
        <Route path="verify-2fa" element={<TwoFactor />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

      <Route element={<DefaultLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/caja" element={<CajaPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
