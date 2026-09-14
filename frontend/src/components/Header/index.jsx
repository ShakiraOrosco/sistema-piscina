import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import useDarkMode from '../../hooks/useDarkMode'

export default function Header() {
  const { session, logout } = useAuth()
  const [colorTheme, setTheme] = useDarkMode()
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
      <div className="flex flex-grow items-center justify-between py-4 px-4 shadow-sm md:px-6 2xl:px-11">
        
        {/* LEFT SIDE: Hamburger & Search */}
        <div className="flex items-center gap-4">
          <button className="flex items-center justify-center w-10 h-10 border border-slate-200 dark:border-[#313D4A] rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#313D4A]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div className="hidden sm:block relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21L15.0001 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <input 
              type="text" 
              placeholder="Search or type command..." 
              className="w-[350px] bg-slate-50 dark:bg-[#1A222C] border border-transparent text-slate-800 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-11 p-2.5 transition-colors placeholder:text-slate-400 hover:border-slate-300 dark:hover:border-[#313D4A] outline-none" 
            />
            <div className="absolute inset-y-0 right-3 flex items-center">
              <span className="text-xs font-medium text-slate-400 bg-white dark:bg-[#24303F] border border-slate-200 dark:border-[#313D4A] rounded px-1.5 py-0.5">⌘K</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Icons & Profile */}
        <div className="flex items-center gap-3 2xsm:gap-5">
          
          <ul className="flex items-center gap-2 2xsm:gap-4">
            <li>
              <button 
                onClick={() => setTheme(colorTheme)}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-colors"
              >
                {colorTheme === 'dark' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.3542 15.3542C19.0526 16.2917 17.5146 16.875 15.875 16.875C11.3877 16.875 7.75 13.2373 7.75 8.75C7.75 7.11037 8.33331 5.5724 9.27076 4.27077C5.77259 5.18526 3.125 8.44195 3.125 12.375C3.125 16.9999 6.87512 20.75 11.5 20.75C15.433 20.75 18.6897 18.1024 19.6042 14.6042C19.866 14.866 20.1417 15.1118 20.3542 15.3542Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 16.5C14.4853 16.5 16.5 14.4853 16.5 12C16.5 9.51472 14.4853 7.5 12 7.5C9.51472 7.5 7.5 9.51472 7.5 12C7.5 14.4853 9.51472 16.5 12 16.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 3V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 20V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5.636 5.636L4.929 4.929" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19.071 19.071L18.364 18.364" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5.636 18.364L4.929 19.071" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19.071 4.929L18.364 5.636" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </li>
            <li>
              <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-colors">
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-500"></span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 17H20L18.5951 15.5951C18.2141 15.2141 18 14.6973 18 14.1585V11C18 8.38757 16.3304 6.16509 14 5.34142V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V5.34142C7.66962 6.16509 6 8.38757 6 11V14.1585C6 14.6973 5.78595 15.2141 5.40493 15.5951L4 17H9M15 17V18C15 19.6569 13.6569 21 12 21C10.3431 21 9 19.6569 9 18V17M15 17H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </li>
          </ul>

          <div className="relative" ref={dropdownRef}>
            <div 
              className="flex items-center gap-3 border-l border-slate-200 dark:border-[#313D4A] pl-4 ml-2 group cursor-pointer" 
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
      </div>
    </header>
  )
}
