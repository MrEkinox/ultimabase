// Section 9: per-file check time from a --generateTrace directory.
const t = JSON.parse(require('fs').readFileSync(process.argv[2] + '/trace.json', 'utf8'))
const open = {}, res = []
for (const e of t) if (e.name === 'checkSourceFile') { if (e.ph === 'B') open[e.args.path] = e.ts; else if (e.ph === 'E') res.push([(e.ts - open[e.args.path]) / 1000, e.args.path.split('/').slice(-2).join('/')]) }
res.sort((a, b) => b[0] - a[0]); for (const [d, p] of res.slice(0, +(process.argv[3] ?? 10))) console.log(d.toFixed(1) + 'ms', p)
console.log('total', res.reduce((a, r) => a + r[0], 0).toFixed(0))
