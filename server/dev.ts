import { createServer } from 'node:http'
import { handleRequest } from './handler.ts'
createServer(async (req, res) => {
 const chunks: Buffer[] = []
 let length = 0
 for await (const chunk of req) {
  length += chunk.length
  if (length > 1024 * 1024) { res.writeHead(413); res.end(); return }
  chunks.push(chunk)
 }
 const headers = new Headers()
 for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value)
 const request = new Request(`http://127.0.0.1:3001${req.url}`, { method: req.method, headers, ...(!['GET','HEAD'].includes(req.method ?? 'GET') ? { body: Buffer.concat(chunks) } : {}) })
 const response = await handleRequest(request)
 res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
}).listen(3001, '127.0.0.1', () => console.log('Upnology API: http://127.0.0.1:3001'))
