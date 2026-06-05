import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/client'

const router = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' })
}

router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    )
    const user = result.rows[0]
    res.cookie('jwt', signToken(user.id), COOKIE_OPTIONS)
    res.status(201).json({ id: user.id, email: user.email })
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    res.cookie('jwt', signToken(user.id), COOKIE_OPTIONS)
    res.json({ id: user.id, email: user.email })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt')
  res.json({ ok: true })
})

export default router
