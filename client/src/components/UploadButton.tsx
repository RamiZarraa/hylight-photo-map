import { useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface UploadButtonProps {
  onUploadSuccess: () => void
}

export default function UploadButton({ onUploadSuccess }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleFile(file: File) {
    setState('uploading')
    setErrorMsg(null)

    const body = new FormData()
    body.append('photo', file)

    try {
      const res = await fetch('/api/photos', {
        method: 'POST',
        credentials: 'include',
        body,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Upload failed (${res.status})`)
      }

      setState('success')
      onUploadSuccess()
      setTimeout(() => setState('idle'), 2500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset so the same file can be re-selected after an error
    e.target.value = ''
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Error toast */}
      {state === 'error' && errorMsg && (
        <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 text-xs px-3 py-2 rounded-lg max-w-56">
          <AlertCircle size={13} className="shrink-0" />
          <span>{errorMsg}</span>
          <button
            onClick={() => setState('idle')}
            className="ml-1 text-red-500 hover:text-red-200 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => state === 'idle' || state === 'error' ? inputRef.current?.click() : undefined}
        disabled={state === 'uploading'}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg
          ${state === 'uploading' ? 'bg-gray-800 text-gray-400 cursor-not-allowed' : ''}
          ${state === 'success' ? 'bg-green-600 text-white' : ''}
          ${state === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : ''}
          ${state === 'idle' ? 'bg-blue-600 text-white hover:bg-blue-500' : ''}
        `}
      >
        {state === 'idle' && <><Upload size={15} /> Upload photo</>}
        {state === 'uploading' && <><Loader2 size={15} className="animate-spin" /> Uploading…</>}
        {state === 'success' && <><CheckCircle size={15} /> Added to map</>}
        {state === 'error' && <><Upload size={15} /> Retry</>}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
