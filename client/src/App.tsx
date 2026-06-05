import { useState } from 'react'
import AuthPage from './pages/AuthPage'
import MapView from './components/MapView'
import PhotoSidebar from './components/PhotoSidebar'
import UploadButton from './components/UploadButton'
import type { User } from './types/auth'
import type { SelectedPhoto } from './types/photo'

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user')
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser)
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    localStorage.removeItem('user')
    setUser(null)
    setSelectedPhoto(null)
  }

  if (!user) {
    return <AuthPage onAuth={setUser} />
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Map — 70% or full width */}
      <div className={`relative ${selectedPhoto ? 'flex-[7]' : 'flex-1'} transition-all duration-200`}>
        <MapView onSelectPhoto={setSelectedPhoto} refreshKey={refreshKey} />

        {/* Logout button — floating top-left */}
        <div className="absolute top-3 left-3 z-10">
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-200 bg-gray-950/80 backdrop-blur px-3 py-1.5 rounded border border-gray-800 transition-colors"
          >
            {user.email} · Sign out
          </button>
        </div>

        {/* Upload button — floating bottom-right */}
        <div className="absolute bottom-8 right-4 z-10">
          <UploadButton onUploadSuccess={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      {/* Sidebar — 30% */}
      {selectedPhoto && (
        <div className="flex-[3]">
          <PhotoSidebar
            photo={selectedPhoto}
            onClose={() => setSelectedPhoto(null)}
          />
        </div>
      )}
    </div>
  )
}
