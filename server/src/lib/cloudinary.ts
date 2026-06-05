import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export function uploadBuffer(
  buffer: Buffer,
  folder = 'hylight'
): Promise<{ public_id: string; secure_url: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'))
        resolve({ public_id: result.public_id, secure_url: result.secure_url })
      }
    )
    stream.end(buffer)
  })
}

export function thumbUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    width: 64,
    height: 64,
    crop: 'fill',
    format: 'jpg',
    secure: true,
  })
}
