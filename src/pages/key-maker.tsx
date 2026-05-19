import React, { useState } from 'react'
import Head from 'next/head'

export default function KeyMakerPage() {
 const [privateKeyPem, setPrivateKeyPem] = useState('')
 const [duration, setDuration] = useState('month')
 const [product, setProduct] = useState('com.example.prakash')
 const [issuer, setIssuer] = useState('Prakash Licensing')
 const [machineCode, setMachineCode] = useState('')
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 const [token, setToken] = useState('')
 const [payload, setPayload] = useState<any>(null)

 const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const f = e.target.files?.[0]
 if (!f) return
 const txt = await f.text()
 setPrivateKeyPem(txt)
 }

 const submit = async (e: React.FormEvent) => {
 e.preventDefault()
 setMessage('')
 setToken('')
 setPayload(null)
 setBusy(true)
 try {
 const r = await fetch('/api/license/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ privateKeyPem, duration, product, issuer, machineCode })
 })
 const j = await r.json()
 if (j.ok) {
 setToken(j.token)
 setPayload(j.payload)
 } else {
 setMessage(j.error || 'Failed to generate license')
 }
 } catch (e: any) {
 setMessage(e?.message || 'Failed to generate license')
 } finally {
 setBusy(false)
 }
 }

 const copy = async () => {
 try {
 await navigator.clipboard.writeText(token)
 setMessage('License key copied')
 } catch {
 setMessage('Copy failed')
 }
 }

 return (
 <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
 <Head>
 <title>Key Maker</title>
 </Head>
 <div className="w-full max-w-2xl p-8 rounded-2xl bg-black/40 backdrop-blur border border-white/10 shadow-xl">
 <div className="text-center mb-6">
 <h1 className="text-2xl font-semibold">License Key Maker</h1>
 <p className="text-sm text-gray-300 mt-2">Generate cryptographically signed license keys</p>
 </div>
 {message && (
 <div className="mb-4 bg-yellow-900/30 border border-yellow-600/40 text-yellow-200 px-4 py-3 rounded-md">{message}</div>
 )}
 <form onSubmit={submit} className="space-y-4">
 <div>
 <div className="text-sm text-gray-200 mb-1">Private Key (PEM)</div>
 <textarea
 value={privateKeyPem}
 onChange={(e) => setPrivateKeyPem(e.target.value)}
 placeholder="-----BEGIN PRIVATE KEY-----"
 className="w-full min-h-[140px] px-4 py-3 rounded-md bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 <div className="mt-2">
 <input type="file" accept=".pem" onChange={onFile} className="text-sm" />
 </div>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <label className="block">
 <span className="text-sm text-gray-200">Duration</span>
 <select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10">
 <option value="week">1 Week</option>
 <option value="month">1 Month</option>
 <option value="year">1 Year</option>
 </select>
 </label>
 <label className="block">
 <span className="text-sm text-gray-200">Product ID</span>
 <input value={product} onChange={(e) => setProduct(e.target.value)} className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10" />
 </label>
 <label className="block">
 <span className="text-sm text-gray-200">Issuer</span>
 <input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10" />
 </label>
 </div>
 <label className="block">
 <span className="text-sm text-gray-200">Computer Code</span>
 <input value={machineCode} onChange={(e) => setMachineCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10" />
 </label>
 <button disabled={busy} type="submit" className="w-full py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors font-medium disabled:opacity-50">
 {busy ? 'Generating...' : 'Generate License Key'}
 </button>
 </form>
 {token && payload && (
 <div className="mt-6 p-4 bg-gray-900/60 border border-white/10 rounded-md">
 <div className="text-sm text-gray-200 mb-2">License Key</div>
 <div className="font-mono text-xs break-all p-3 bg-black/60 border border-white/10 rounded">{token}</div>
 <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-300">
 <div>License ID: {payload.licenseId}</div>
 <div>Product: {payload.product}</div>
 <div>Issuer: {payload.iss}</div>
 <div>Valid From: {new Date(payload.nbf).toLocaleString()}</div>
 <div>Expires: {new Date(payload.exp).toLocaleString()}</div>
 <div>Duration: {payload.durationSeconds / 86400} days</div>
 </div>
 <div className="mt-4">
 <button onClick={copy} className="w-full py-2 px-4 rounded-md bg-green-600 hover:bg-green-500 transition-colors font-medium">Copy Key</button>
 </div>
 </div>
 )}
 </div>
 </div>
 )
}

