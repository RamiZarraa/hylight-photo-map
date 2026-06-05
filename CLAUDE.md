# HyLight Technical Test

## Stack

- Frontend: React + TypeScript + TailwindCSS + MapLibre GL
- Backend: Node.js + Express + PostgreSQL + PostGIS
- Auth: JWT
- Storage: Cloudinary (free tier)
- EXIF extraction: exifr
- AI: Ollama (local) + LLaVA model — zero cost, self-hosted
- Deploy: Docker Compose local

## Project structure

monorepo: /client (React + Vite) + /server (Express)

## UI Rules

- Clean, minimal, dark-friendly dashboard aesthetic
- lucide-react for icons
- No generic UI — think ops/field tooling
- Map takes 70% of the screen, sidebar for photo details

## Rules

- Ask before creating files outside the defined structure
- Never install a package without telling me first
- Explain what you're doing before doing it
- One feature at a time — wait for my validation before moving to the next
