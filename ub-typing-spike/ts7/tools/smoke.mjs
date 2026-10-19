import path from 'node:path'
import { startServer, hoverCode } from './lsp.mjs'
const dir = path.resolve(process.argv[2])
const file = path.join(dir, process.argv[3])
const find = process.argv[4]
const s = await startServer(dir)
console.log('server caps keys:', Object.keys(s.init.capabilities).join(','))
const t0 = performance.now()
const d = await s.diagnostics(file)
console.log('diag', d.length, (performance.now() - t0).toFixed(0), 'ms')
const idx = s.text(file).indexOf(find)
const h = await s.hover(file, idx)
console.log(JSON.stringify(h, null, 1))
console.log('code:', hoverCode(h))
await s.close()
