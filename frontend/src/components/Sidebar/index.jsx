import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Sidebar() {
  const { session } = useAuth()

  return (
    <aside className="absolute left-0 top-0 z-9999 flex h-screen w-[290px] flex-col overflow-y-hidden bg-white dark:bg-[#24303F] border-r border-slate-200 dark:border-[#313D4A] duration-300 ease-linear lg:static lg:translate-x-0">
      {/* SIDEBAR HEADER */}
      <div className="flex items-center justify-start gap-2 px-6 py-5.5 lg:py-6.5 mt-2 mb-2">
        <NavLink to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 12V20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20V12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M12 15L12 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M8 7L12 3L16 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <strong className="text-2xl font-bold text-slate-800 dark:text-white">Playa Azul</strong>
        </NavLink>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mt-5 py-4 px-4 lg:mt-2 lg:px-6">
          <div>
            <h3 className="mb-4 ml-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              MENÚ
            </h3>

            <ul className="mb-6 flex flex-col gap-1.5">
              {session?.usuario?.sigla_rol !== 'CAJ' && (
                <li>
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-md px-4 py-2.5 font-medium duration-300 ease-in-out ${
                        isActive 
                          ? 'bg-blue-50 dark:bg-[#313D4A] text-blue-600 dark:text-white' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A] hover:text-slate-700 dark:hover:text-white'
                      }`
                    }
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                    </svg>
                    Dashboard
                  </NavLink>
                </li>
              )}

              {session?.usuario?.sigla_rol !== 'OPE' && (
                <li>
                  <NavLink
                    to="/caja"
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-md px-4 py-2.5 font-medium duration-300 ease-in-out ${
                        isActive 
                          ? 'bg-blue-50 dark:bg-[#313D4A] text-blue-600 dark:text-white' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A] hover:text-slate-700 dark:hover:text-white'
                      }`
                    }
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
                    </svg>
                    Caja
                  </NavLink>
                </li>
              )}

              {session?.usuario?.sigla_rol !== 'CAJ' && (
                <li>
                  <NavLink
                    to="/inventario"
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-md px-4 py-2.5 font-medium duration-300 ease-in-out ${
                        isActive 
                          ? 'bg-blue-50 dark:bg-[#313D4A] text-blue-600 dark:text-white' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A] hover:text-slate-700 dark:hover:text-white'
                      }`
                    }
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                    Inventario
                  </NavLink>
                </li>
              )}

              {session?.usuario?.sigla_rol === 'ADM' && (
                <>
                  <li>
                    <NavLink
                      to="/users"
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-md px-4 py-2.5 font-medium duration-300 ease-in-out ${
                          isActive 
                            ? 'bg-blue-50 dark:bg-[#313D4A] text-blue-600 dark:text-white' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A] hover:text-slate-700 dark:hover:text-white'
                        }`
                      }
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                      </svg>
                      Usuarios
                    </NavLink>
                  </li>

                  <li>
                    <NavLink
                      to="/auditoria"
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-md px-4 py-2.5 font-medium duration-300 ease-in-out ${
                          isActive 
                            ? 'bg-blue-50 dark:bg-[#313D4A] text-blue-600 dark:text-white' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A] hover:text-slate-700 dark:hover:text-white'
                        }`
                      }
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                      </svg>
                      Auditoría
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>
      </div>
    </aside>
  )
}
