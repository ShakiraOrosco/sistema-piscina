import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Header() {
  const { session, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const clickHandler = ({ target }) => {
      if (!dropdownRef.current) return
      if (!dropdownOpen || dropdownRef.current.contains(target)) return
      setDropdownOpen(false)
    }
    document.addEventListener('click', clickHandler)
    return () => document.removeEventListener('click', clickHandler)
  })

  return (
    <header className="sticky top-0 z-999 flex w-full bg-white dark:bg-[#24303F] border-b border-slate-200 dark:border-[#313D4A]">
      <div className="flex flex-grow items-center justify-end py-4 px-4 shadow-sm md:px-6 2xl:px-11">
        <div className="relative" ref={dropdownRef}>
          <div 
            className="flex items-center gap-3 group cursor-pointer" 
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-bold overflow-hidden">
              {session?.usuario?.nombre?.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-right lg:block">
              <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                {session?.usuario?.nombre} {session?.usuario?.primer_apellido}
              </span>
            </span>
            <svg 
              className={`hidden lg:block w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-4 flex w-62.5 flex-col rounded-xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] shadow-lg z-99999 w-[260px]">
                <div className="px-6 py-5 border-b border-slate-200 dark:border-[#313D4A]">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                    {session?.usuario?.nombre} {session?.usuario?.primer_apellido}
                  </span>
                  <span className="block text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    {session?.usuario?.correo}
                  </span>
                </div>

                <ul className="flex flex-col gap-1 px-4 py-4 border-b border-slate-200 dark:border-[#313D4A]">
                  <li>
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3.5 text-sm font-medium duration-300 ease-in-out hover:text-blue-600 dark:hover:text-white text-slate-600 dark:text-slate-300 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#313D4A]"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                      </svg>
                      Mi Perfil
                    </Link>
                  </li>
                </ul>
                
                <div className="px-4 py-4">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3.5 text-sm font-medium duration-300 ease-in-out hover:text-red-600 text-slate-600 dark:text-slate-300 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#313D4A]"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                    </svg>
                    Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    )
  }
