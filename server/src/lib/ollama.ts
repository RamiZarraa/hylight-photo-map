import { pool } from '../db/client'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://ollama:11434'

const PROMPT =
  'You are analyzing an aerial inspection photo of railway or energy infrastructure. ' +
  'Describe what you see in 2-3 sentences: identify the infrastructure type, ' +
  'any notable features, visible conditions, or anomalies.'

export async function generateAiDescription(photoId: string, imageUrl: string): Promise<void> {
  try {
    // Fetch the image from Cloudinary and encode as base64
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')

    // Call LLaVA with a 2-minute timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let ollamaRes: Response
    try {
      ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'llava',
          prompt: PROMPT,
          images: [base64],
          stream: false,
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!ollamaRes.ok) throw new Error(`Ollama error: ${ollamaRes.status}`)

    const data = (await ollamaRes.json()) as { response?: string }
    const description = data.response?.trim()
    if (!description) throw new Error('Empty response from LLaVA')

    await pool.query(
      `UPDATE photos SET ai_description = $1, ai_status = 'done' WHERE id = $2`,
      [description, photoId],
    )

    console.log(`[AI] Photo ${photoId} — description generated`)
  } catch (err) {
    console.error(`[AI] Photo ${photoId} — generation failed:`, err)
    await pool.query(`UPDATE photos SET ai_status = 'failed' WHERE id = $1`, [photoId])
  }
}
