export default function FloatingErrorToast({ message, onClose, title = 'Ocurrió un error' }) {
  if (!message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="toast-error fixed top-4 left-4 z-[999999] flex w-[calc(100vw-2rem)] max-w-md items-start gap-3 rounded-xl border border-red-200 border-l-4 border-l-red-500 bg-white/95 p-4 shadow-xl backdrop-blur-sm dark:border-red-900/50 dark:border-l-red-500 dark:bg-[#24303F]/95"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <h5 className="text-sm font-bold text-red-800 dark:text-red-300">{title}</h5>
        <p className="mt-0.5 text-sm leading-relaxed text-red-600 dark:text-red-400 break-words">
          {message}
        </p>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar mensaje de error"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
