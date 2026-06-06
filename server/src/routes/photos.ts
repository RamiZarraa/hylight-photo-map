import { Router, Response } from 'express'
import multer from 'multer'
import { pool } from '../db/client'
import { uploadBuffer, thumbUrl } from '../lib/cloudinary'
import { requireAuth, AuthRequest } from '../middleware/requireAuth'
import { generateAiDescription } from '../lib/ollama'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype === 'image/jpeg'
      ? cb(null, true)
      : cb(new Error('JPEG only'))
  },
})

router.post('/', requireAuth, upload.single('photo'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  try {
    // Parse EXIF — exifr is ESM-only, dynamic import required
    const { default: exifr } = await import('exifr')
    const parsed = await exifr.parse(req.file.buffer, { gps: true, exif: true, tiff: true })

    if (!parsed?.latitude || !parsed?.longitude) {
      res.status(422).json({ error: 'Photo has no GPS data' })
      return
    }

    const { latitude, longitude } = parsed
    const altitude: number | null = parsed.altitude ?? parsed.GPSAltitude ?? null
    const exifData = {
      make: parsed.Make ?? null,
      model: parsed.Model ?? null,
      focalLength: parsed.FocalLength ?? null,
      iso: parsed.ISO ?? null,
      shutterSpeed: parsed.ExposureTime ?? null,
    }

    // Upload original to Cloudinary
    const { public_id, secure_url } = await uploadBuffer(req.file.buffer)
    const thumb = thumbUrl(public_id)

    // Insert row
    const result = await pool.query(
      `INSERT INTO photos
         (user_id, location, altitude, exif, cloudinary_public_id, thumb_url, full_url, taken_at, ai_status)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id`,
      [
        req.userId,
        longitude,
        latitude,
        altitude,
        JSON.stringify(exifData),
        public_id,
        thumb,
        secure_url,
        parsed.DateTimeOriginal ?? null,
      ]
    )

    const photoId = result.rows[0].id

    // Fire-and-forget — do not await
    generateAiDescription(photoId, secure_url)

    res.status(201).json({
      id: photoId,
      location: { lat: latitude, lng: longitude },
      thumb_url: thumb,
      full_url: secure_url,
    })
  } catch (err) {
    console.error('Photo upload error:', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, ai_status, ai_description FROM photos WHERE id = $1`,
      [req.params.id],
    )
    if (!result.rows.length) {
      res.status(404).json({ error: 'Photo not found' })
      return
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Photo fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch photo' })
  }
})

router.get('/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.body, c.created_at, u.email
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.photo_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id],
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Comments fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch comments' })
  }
})

router.post('/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  const { body } = req.body
  if (!body || typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: 'Comment body is required' })
    return
  }
  try {
    const result = await pool.query(
      `INSERT INTO comments (photo_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at`,
      [req.params.id, req.userId, body.trim()],
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Comment insert error:', err)
    res.status(500).json({ error: 'Failed to post comment' })
  }
})

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { bbox } = req.query
    let rows: any[]

    if (bbox && typeof bbox === 'string') {
      const [west, south, east, north] = bbox.split(',').map(Number)
      if ([west, south, east, north].some(isNaN)) {
        res.status(400).json({ error: 'Invalid bbox. Expected: west,south,east,north' })
        return
      }
      const result = await pool.query(
        `SELECT id, thumb_url, full_url, altitude, ai_description, ai_status, taken_at,
                ST_X(location::geometry) AS lng,
                ST_Y(location::geometry) AS lat
         FROM photos
         WHERE ST_Within(location::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
         ORDER BY created_at DESC`,
        [west, south, east, north]
      )
      rows = result.rows
    } else {
      const result = await pool.query(
        `SELECT id, thumb_url, full_url, altitude, ai_description, ai_status, taken_at,
                ST_X(location::geometry) AS lng,
                ST_Y(location::geometry) AS lat
         FROM photos
         ORDER BY created_at DESC
         LIMIT 500`
      )
      rows = result.rows
    }

    res.json({
      type: 'FeatureCollection',
      features: rows.map((row) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
        properties: {
          id: row.id,
          thumb_url: row.thumb_url,
          full_url: row.full_url,
          altitude: row.altitude,
          ai_description: row.ai_description,
          ai_status: row.ai_status,
          taken_at: row.taken_at,
        },
      })),
    })
  } catch (err) {
    console.error('Photos fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch photos' })
  }
})

export default router
