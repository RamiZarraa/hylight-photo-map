CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location             GEOGRAPHY(Point, 4326) NOT NULL,
  altitude             FLOAT8,
  exif                 JSONB DEFAULT '{}',
  cloudinary_public_id TEXT,
  thumb_url            TEXT,
  full_url             TEXT,
  ai_description       TEXT,
  ai_status            VARCHAR(20) DEFAULT 'pending' CHECK (ai_status IN ('pending', 'done', 'failed')),
  taken_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_location_idx ON photos USING GIST (location);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
