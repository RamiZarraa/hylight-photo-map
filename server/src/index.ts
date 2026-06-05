import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import authRouter from './routes/auth'
import photosRouter from './routes/photos'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())
app.use(cookieParser())
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,
}))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/photos', photosRouter)

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})
