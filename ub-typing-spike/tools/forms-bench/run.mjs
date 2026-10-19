// Sequential campaign over the form configurations (one process at a time).
// Per configuration and N: generate, then 3 fresh runs of tools/bench.mjs, ./tsc --extendedDiagnostics
// (under /usr/bin/time -l, parsed like tools/run-bench.sh) and tools/forms-bench/bench-rule.mjs.
// Waits while the 1-min load is above 4 (checked before each configuration).
// Usage: node tools/forms-bench/run.mjs [--sizes "10 50 200"] [--runs 3] [--real] [label ...]
//   -> results/forms/{bench,tsc,rule,load}.jsonl ; --real: results/forms/real-baseline.jsonl only
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, select } from './configs.mjs'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
	const i = argv.indexOf(name)
	if (i === -1) return fallback
	const value = argv[i + 1]
	argv.splice(i, 2)
	return value
}
const sizes = option('--sizes', '10 50 200').split(/\s+/).filter(Boolean).map(Number)
const runs = Number(option('--runs', '3'))
const real = argv.includes('--real')
const labels = argv.filter((a) => a !== '--real')
const out = (file) => path.join(root, 'results/forms', file)
const append = (file, row) => fs.appendFileSync(out(file), `${JSON.stringify(row)}\n`)
const log = (line) => {
	const text = `${new Date().toISOString()} ${line}`
	console.log(text)
	fs.appendFileSync(out('run.log'), `${text}\n`)
}
const TIMEOUT = 900_000

const waitCalm = async (what) => {
	for (let waited = 0; ; waited += 30) {
		const [one, five, fifteen] = os.loadavg()
		if (one <= 4) {
			append('load.jsonl', { what, at: new Date().toISOString(), load1: one, load5: five, load15: fifteen, waitedS: waited })
			return one
		}
		if (waited >= 1800) throw new Error(`load still ${one.toFixed(2)} after 30 min before ${what}`)
		log(`load ${one.toFixed(2)} > 4 before ${what}, waiting 30 s`)
		await new Promise((resolve) => setTimeout(resolve, 30_000))
	}
}
const node = (args, cwd = root) => spawnSync('node', args, { cwd, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 256 * 1024 * 1024 })
const jsonLine = (result) => (result.stdout ?? '').split('\n').find((l) => l.startsWith('{'))
const tscJs = '/Users/mrekinox/Desktop/ub-small/node_modules/typescript/bin/tsc'
const parseTsc = (s) => {
	const g = (r) => {
		const m = s.match(r)
		return m ? Number(m[1]) : null
	}
	const codes = [...s.matchAll(/error (TS\d+)/g)].map((m) => m[1])
	return {
		checkS: g(/Check time:\s+([\d.]+)s/),
		totalS: g(/Total time:\s+([\d.]+)s/),
		memoryK: g(/Memory used:\s+(\d+)K/),
		instantiations: g(/Instantiations:\s+(\d+)/),
		types: g(/Types:\s+(\d+)/),
		maxRssBytes: g(/(\d+)\s+maximum resident set size/),
		errors: codes.length,
		errorCodes: Object.fromEntries([...new Set(codes)].map((c) => [c, codes.filter((x) => x === c).length])),
	}
}

if (real) {
	for (const n of sizes) {
		const load1 = await waitCalm(`real-${n}`)
		for (let run = 1; run <= runs; run += 1) {
			const r = node(['--expose-gc', '--max-old-space-size=12288', 'probe.mjs', String(n)], path.join(root, 'tools/real-baseline'))
			const line = jsonLine(r)
			append('real-baseline.jsonl', line ? { ...JSON.parse(line), run, load1 } : { schemaCount: n, run, failed: true, status: r.status, signal: r.signal, stderr: (r.stderr ?? '').slice(-2000) })
		}
		log(`done real-${n} load ${os.loadavg().map((l) => l.toFixed(2)).join(' ')}`)
	}
	process.exit(0)
}

for (const n of sizes) {
	for (const config of select(labels)) {
		const id = `${config.label}-${n}`
		const load1 = await waitCalm(id)
		const gen = node([path.join(root, 'forms', config.form, 'gen.mjs'), String(n), ...config.args])
		if (gen.status !== 0) {
			log(`generation failed ${id}: ${gen.stderr}`)
			continue
		}
		const dir = config.dir(n)
		for (let run = 1; run <= runs; run += 1) {
			const base = { label: config.label, n, run, load1 }
			const bench = node(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/bench.mjs'), dir])
			const benchLine = jsonLine(bench)
			append('bench.jsonl', benchLine ? { ...base, ...JSON.parse(benchLine) } : { ...base, failed: true, status: bench.status, signal: bench.signal, stderr: (bench.stderr ?? '').slice(-2000) })
			const tsc = spawnSync('/usr/bin/time', ['-l', 'node', tscJs, '-p', 'tsconfig.json', '--extendedDiagnostics'], { cwd: dir, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 256 * 1024 * 1024 })
			append('tsc.jsonl', { ...base, ...parseTsc(`${tsc.stdout}${tsc.stderr}`), status: tsc.status, signal: tsc.signal })
			const rule = node(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/forms-bench/bench-rule.mjs'), dir, config.ruleFile])
			const ruleLine = jsonLine(rule)
			append('rule.jsonl', ruleLine ? { ...base, ...JSON.parse(ruleLine) } : { ...base, failed: true, status: rule.status, signal: rule.signal, stderr: (rule.stderr ?? '').slice(-2000) })
		}
		log(`done ${id} load ${os.loadavg().map((l) => l.toFixed(2)).join(' ')}`)
	}
}
