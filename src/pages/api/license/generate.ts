import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

function durationToSeconds(d: string): number {
  switch (d) {
    case 'week': return 7 * 24 * 60 * 60
    case 'month': return 30 * 24 * 60 * 60
    case 'year': return 365 * 24 * 60 * 60
    default:
      if (/^\\d+[smhd]$/.test(d)) {
        const n = parseInt(d, 10)
        const unit = d.slice(-1)
        const m: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
        return n * m[unit]
      }
      throw new Error('Invalid duration')
  }
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '')
}

function computePublicKeyFingerprint(publicPem: string): string {
  const body = publicPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\\s+/g, '')
  const der = Buffer.from(body, 'base64')
  return crypto.createHash('sha256').update(der).digest('base64')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const { privateKeyPem, duration, product, issuer, machineCode } = req.body || {}
    if (!privateKeyPem || typeof privateKeyPem !== 'string') return res.status(400).json({ error: 'privateKeyPem required' })
    if (!machineCode || typeof machineCode !== 'string' || machineCode.replace(/\\s+/g, '').length < 8) return res.status(400).json({ error: 'machineCode invalid' })
    const durSec = durationToSeconds(String(duration || 'month'))
    const now = Date.now()
    const iat = new Date(now).toISOString()
    const nbf = new Date(now - 30000).toISOString()
    const exp = new Date(now + durSec * 1000).toISOString()
    const pub = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString()
    const kid = computePublicKeyFingerprint(pub)
    const payload = {
      kid,
      iss: String(issuer || 'Prakash Licensing'),
      product: String(product || 'com.example.prakash'),
      iat,
      nbf,
      exp,
      licenseId: 'LIC-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
      durationSeconds: durSec,
      machineCode: String(machineCode).replace(/\\s+/g, '')
    }
    const payloadStr = JSON.stringify(payload)
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(payloadStr)
    signer.end()
    const sig = signer.sign(privateKeyPem)
    const token = ['PRK', bufferToBase64Url(Buffer.from(payloadStr)), bufferToBase64Url(sig)].join('.')
    return res.status(200).json({ ok: true, token, payload })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
}
