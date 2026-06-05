import { useEffect, useState } from 'react'
import { X, MapPin, Mountain, Clock, Cpu } from 'lucide-react'
import type { SelectedPhoto } from '../types/photo'

interface PhotoSidebarProps {
  photo: SelectedPhoto
  onClose: () => void
}

const AI_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'AI pending', className: 'bg-yellow-500/20 text-yellow-300' },
  done: { label: 'AI done', className: 'bg-green-500/20 text-green-300' },
  failed: { label: 'AI failed', className: 'bg-red-500/20 text-red-400' },
}

export default function PhotoSidebar({ photo, onClose }: PhotoSidebarProps) {
  const [aiStatus, setAiStatus] = useState(photo.ai_status)
  const [aiDescription, setAiDescription] = useState(photo.ai_description)

  // Reset when a different photo is selected
  useEffect(() => {
    setAiStatus(photo.ai_status)
    setAiDescription(photo.ai_description)
  }, [photo.id])

  // Poll every 5s while pending
  useEffect(() => {
    if (aiStatus !== 'pending') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/photos/${photo.id}`, { credentials: 'include' })
        const data = await res.json()
        setAiStatus(data.ai_status)
        setAiDescription(data.ai_description)
        if (data.ai_status !== 'pending') clearInterval(interval)
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [photo.id, aiStatus])

  const status = AI_STATUS[aiStatus] ?? AI_STATUS.pending

  const takenAt = photo.taken_at
    ? new Date(photo.taken_at).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="flex flex-col h-full bg-gray-950 border-l border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Photo detail
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Image */}
      <div className="relative bg-gray-900 border-b border-gray-800">
        <img
          src={photo.full_url}
          alt="Aerial photo"
          className="w-full object-contain max-h-64"
          loading="lazy"
        />
        <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>

      {/* Metadata */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2.5">
          <MetaRow icon={<MapPin size={14} />} label="Coordinates">
            {photo.lat.toFixed(5)}°N, {photo.lng.toFixed(5)}°E
          </MetaRow>

          {photo.altitude != null && (
            <MetaRow icon={<Mountain size={14} />} label="Altitude">
              {Math.round(photo.altitude)} m
            </MetaRow>
          )}

          {takenAt && (
            <MetaRow icon={<Clock size={14} />} label="Captured">
              {takenAt}
            </MetaRow>
          )}
        </div>

        {/* AI description */}
        <div className="pt-2 border-t border-gray-800">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <Cpu size={13} />
            <span className="uppercase tracking-wider">AI description</span>
          </div>
          {aiDescription ? (
            <p className="text-sm text-gray-300 leading-relaxed">{aiDescription}</p>
          ) : (
            <p className="text-xs text-gray-600 italic">
              {aiStatus === 'pending' ? 'Generating description…' : 'No description available'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-500 shrink-0">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-0.5">{label}</div>
        <div className="text-sm text-gray-200">{children}</div>
      </div>
    </div>
  )
}
