import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'

export default function DefaultLayout() {
  const { session, error, message } = useAuth()

  if (!session) {
    return <Navigate to="/auth/login" replace />
  }

  if (session.must_change_password) {
    return <Navigate to="/auth/change-password" replace />
  }

  return (
    <div className="tailadmin-layout flex h-screen overflow-hidden font-sans text-slate-800">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <Header />
        
        <main className="mx-auto w-full max-w-screen-2xl p-4 md:p-6 2xl:p-10">
          {error && (
            <div className="mb-6 flex w-full border-l-6 border-red-500 bg-red-50 px-7 py-4 shadow-sm rounded-md">
              <div className="w-full">
                <h5 className="mb-1 text-lg font-semibold text-red-800">Ocurrió un error</h5>
                <p className="leading-relaxed text-red-600">{error}</p>
              </div>
            </div>
          )}
          
          {message && (
            <div className="mb-6 flex w-full border-l-6 border-green-500 bg-green-50 px-7 py-4 shadow-sm rounded-md">
              <div className="w-full">
                <p className="leading-relaxed text-green-700 font-medium">{message}</p>
              </div>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  )
}
