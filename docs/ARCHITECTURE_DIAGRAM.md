# HyLight — Architecture Diagrams

Full narrative context is in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Service Topology

```
  Browser                              Docker Compose (local)
  ┌─────────────────────┐              ┌────────────────────────────────────────────────────┐
  │                     │              │  ┌─────────────────┐    ┌──────────────────────┐   │
  │  React SPA          │──REST/JSON───┼─►│   nginx  :80    │───►│  Express API  :3000  │   │
  │  MapLibre GL        │              │  │   Vite static   │    │  JWT · upload · EXIF │   │
  │  Sidebar            │              │  │   proxy /api    │    └──────────┬───────────┘   │
  │                     │              │  └─────────────────┘               │ SQL queries   │
  └──────────┬──────────┘              │                         ┌──────────▼────────────┐  │
             │                         │                         │  PostgreSQL  :5432     │  │
             │  GET thumbnails         │                         │  + PostGIS             │  │
             │  & full-res images      │                         │  [named volume]        │  │
             ▼                         │                         └───────────────────────┘  │
  ┌─────────────────────┐              │                                    |  async         │
  │     Cloudinary      │◄─upload(SDK)─┼──────────── Express API ──────────┘  fire-forget   │
  │  image store + CDN  │              │                         ┌──────────────────────┐   │
  │  free → R2 at scale │              │                         │  Ollama (LLaVA)      │   │
  └─────────────────────┘              │                         │  :11434  [model vol] │   │
                                       │                         └──────────────────────┘   │
  ┌─────────────────────┐              └────────────────────────────────────────────────────┘
  │   OSM Tile Server   │◄── GET /tiles (browser fetches map tiles directly)
  │ tile.openstreetmap  │
  └─────────────────────┘
```

---

## 2. Data Model (ER)

```
  ┌──────────────────────┐     ┌──────────────────────────────────┐     ┌────────────────────┐
  │        USERS         │     │              PHOTOS               │     │      COMMENTS      │
  ├──────────────────────┤     ├──────────────────────────────────┤     ├────────────────────┤
  │ id           uuid PK │     │ id             uuid          PK  │     │ id        uuid  PK │
  │ email       varchar  │     │ user_id        uuid  FK          │     │ photo_id  uuid  FK │
  │ password_hash  text  │     │ location  GEOGRAPHY(Point,4326)  │     │ user_id   uuid  FK │
  │ created_at     tstz  │     │              GiST index          │     │ body         text  │
  └──────────────────────┘     │ altitude       float8            │     │ created_at   tstz  │
                               │ exif           jsonb             │     └────────────────────┘
                               │ cloudinary_public_id  text       │
                               │ thumb_url      text              │
                               │ full_url       text              │
                               │ ai_description text  (nullable)  │
                               │ ai_status      varchar           │
                               │   pending | done | failed        │
                               │ taken_at       tstz              │
                               │ created_at     tstz              │
                               └──────────────────────────────────┘

  Relations:
    USERS  (1)──uploads──(∞)  PHOTOS    via photos.user_id
    PHOTOS (1)──has──────(∞)  COMMENTS  via comments.photo_id
    USERS  (1)──writes───(∞)  COMMENTS  via comments.user_id
```

---

## 3. Upload → Map Data Flow

```
  Operator       Express API      exifr        Cloudinary    Postgres+GIS     Ollama
  ──────────     ───────────      ─────        ──────────    ────────────     ──────
      │                │             │               │              │             │
      │  POST /photos  │             │               │              │             │
      │  (5 MB JPEG,   │             │               │              │             │
      │   multipart)   │             │               │              │             │
      ├───────────────►│             │               │              │             │
      │                │ parse EXIF  │               │              │             │
      │                ├────────────►│               │              │             │
      │                │◄────────────┤               │              │             │
      │                │ {lat, lng, altitude,         │              │             │
      │                │  takenAt, camera, ...}       │              │             │
      │                │             │               │              │             │
      │          ╔═════╧═════════════╗               │              │             │
      │          ║ if GPS missing    ║               │              │             │
      │◄─────────╢ return 422        ║               │              │             │
      │          ╚═══════════════════╝               │              │             │
      │                │             │               │              │             │
      │                │ upload(buffer)               │              │             │
      │                ├─────────────────────────────►              │             │
      │                │◄─────────────────────────────              │             │
      │                │ {public_id, secure_url}      │              │             │
      │                │             │               │              │             │
      │                │ INSERT INTO photos (location=ST_Point, exif, urls,       │
      │                │   ai_status='pending')                      │             │
      │                ├────────────────────────────────────────────►             │
      │                │◄────────────────────────────────────────────             │
      │                │ {id}        │               │              │             │
      │                │             │               │              │             │
      │ 201 {id,       │             │               │              │             │
      │  location,     │             │               │              │             │
      │  thumb_url}    │             │               │              │             │
      │◄───────────────┤             │               │              │             │
      │                │             │               │              │             │
  [ Marker appears on the map immediately ]          │              │             │
      │                │             │               │              │             │
  [ fire-and-forget — does not block the response ]  │              │             │
      │                │             │               │              │             │
      │                ├─────────────────────────────────────────────────────────►
      │                │  POST /api/generate {model: "llava", images:[b64], prompt}
      │                │◄─────────────────────────────────────────────────────────
      │                │  "Overhead view of railway catenary at ~200 m altitude..."
      │                │             │               │              │             │
      │                │  UPDATE ai_description, ai_status='done'   │             │
      │                ├────────────────────────────────────────────►             │
      │                │             │               │              │             │
      │  GET /photos/:id (on marker click)            │              │             │
      ├───────────────►│             │               │              │             │
      │◄───────────────┤             │               │              │             │
      │  {photo, ai_description, comments}            │              │             │
```

---

## 4. Auth Flow

```
  Browser          Express API       Postgres
  ───────          ───────────       ────────
     │                  │               │
     │  POST /auth/login │               │
     │  {email, password}│               │
     ├─────────────────►│               │
     │                  │ SELECT id,     │
     │                  │ password_hash  │
     │                  │ WHERE email=?  │
     │                  ├──────────────►│
     │                  │◄──────────────┤
     │                  │  {id, hash}   │
     │                  │               │
     │                  │ bcrypt.compare(password, hash)
     │                  │               │
     │           ╔══════╧══════╗        │
     │           ║ if invalid  ║        │
     │◄──────────╢ 401 Unauth  ║        │
     │           ╚═════════════╝        │
     │                  │               │
     │  Set-Cookie: jwt=<token>         │
     │  HttpOnly; SameSite=Strict       │
     │◄─────────────────┤               │
     │                  │               │
     │  GET /api/photos?bbox=...        │
     │  (cookie auto-attached)          │
     ├─────────────────►│               │
     │                  │ verifyJWT     │
     │                  │ (middleware)  │
     │                  │               │
     │  200 GeoJSON FeatureCollection   │
     │◄─────────────────┤               │
```

---

## 5. Map Performance at Scale (10k+ photos)

```
  ┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────────┐
  │  User pans/zooms │     │  Browser sends       │     │  PostGIS ST_Within()     │
  │  the map viewport├────►│  bbox=west,south,    ├────►│  on GEOGRAPHY column     │
  │                  │     │        east,north    │     │  GiST index — sub-ms     │
  └──────────────────┘     └─────────────────────┘     │  at 10k rows             │
                                                        └────────────┬─────────────┘
                                                                     │
                                                      GeoJSON: only visible photos
                                                      (not all 10k transmitted)
                                                                     │
                                          ┌──────────────────────────┴─────────────────────┐
                                          │                                                 │
                                          ▼                                                 ▼
                              ┌───────────────────────┐                    ┌───────────────────────┐
                              │  MapLibre clustering   │                    │  Marker thumbnails    │
                              │  cluster: true on      │                    │  64px Cloudinary URLs │
                              │  GeoJSON source        │                    │  ~3–5 KB each         │
                              │  GPU-rendered badges   │                    │  loaded on demand     │
                              └───────────┬───────────┘                    └────────────┬──────────┘
                                          │                                              │
                                          └──────────────────┬───────────────────────────┘
                                                             ▼
                                                ┌─────────────────────┐
                                                │  Smooth 60fps       │
                                                │  map render         │
                                                └─────────────────────┘
```

---

## 6. Docker Compose Service Graph

```
  ┌────────────────────────────────────────────────────────┐
  │                   docker compose up                    │
  │                                                        │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │  web  (nginx:alpine)                             │  │
  │  │  build: ./client                                 │  │
  │  │  port  80:80                                     │  │
  │  │  serves Vite static build, proxies /api → api    │  │
  │  └──────────────────────────┬───────────────────────┘  │
  │                  proxy_pass /api                        │
  │                             │                           │
  │                             ▼                           │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │  api  (node:20-alpine)                           │  │
  │  │  build: ./server                                 │  │
  │  │  port  3000:3000                                 │  │
  │  │  env_file: .env                                  │  │
  │  └──────────────┬────────────────────┬──────────────┘  │
  │   depends_on    │                    │  HTTP (async)    │
  │   + healthcheck │                    │                  │
  │                 ▼                    ▼                  │
  │  ┌──────────────────────┐  ┌─────────────────────────┐ │
  │  │  db                  │  │  ollama                 │ │
  │  │  postgis/postgis:16  │  │  ollama/ollama:latest   │ │
  │  │  port  5432:5432     │  │  port  11434:11434      │ │
  │  │  volume: pgdata       │  │  volume: ollama_models  │ │
  │  │  init.sql on first   │  │  pulls llava once,      │ │
  │  │  boot (PostGIS ext + │  │  reused across restarts │ │
  │  │  CREATE TABLE)       │  │                         │ │
  │  └──────────────────────┘  └─────────────────────────┘ │
  └────────────────────────────────────────────────────────┘
```
