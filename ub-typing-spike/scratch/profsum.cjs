// Section 9: self-time summary of a V8 .cpuprofile directory (first file).
const fs = require('fs'); const dir = process.argv[2]; const f = fs.readdirSync(dir)[0]; const p = JSON.parse(fs.readFileSync(dir + '/' + f))
const byId = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map()
p.samples.forEach((s, i) => { const n = byId.get(s); const k = n.callFrame.functionName; self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0)) })
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, +(process.argv[3] ?? 15)).map(([k, t]) => (t / 1000).toFixed(0) + 'ms ' + k).join('\n'))
