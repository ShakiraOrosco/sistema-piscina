import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthLayout() {
  const { error } = useAuth()

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <Outlet />
    </>
  )
}
