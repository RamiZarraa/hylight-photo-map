export interface PhotoProperties {
  id: string
  thumb_url: string
  full_url: string
  altitude: number | null
  ai_description: string | null
  ai_status: 'pending' | 'done' | 'failed'
  taken_at: string | null
}

export interface SelectedPhoto extends PhotoProperties {
  lng: number
  lat: number
}

export interface Comment {
  id: string
  body: string
  created_at: string
  email: string
}
