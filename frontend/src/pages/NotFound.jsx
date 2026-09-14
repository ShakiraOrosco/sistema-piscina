import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <h1 className="text-9xl font-black text-slate-200 dark:text-slate-700">404</h1>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Página no encontrada
        </h2>
        <p className="mt-4 text-slate-500 dark:text-slate-400">
          Lo sentimos, no pudimos encontrar la página que estás buscando.
        </p>
        
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <button
            onClick={() => navigate(-1)}
            className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            ← Volver atrás
          </button>
          <a
            href="/"
            className="text-sm font-semibold text-slate-900 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Ir al inicio <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </div>
  )
}
