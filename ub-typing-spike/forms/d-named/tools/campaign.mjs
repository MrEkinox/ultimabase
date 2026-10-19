// Sequential TS6 + TS7 campaign for d-named against d-hybrid (same method as forms/BENCH.md and
// forms/TS7.md, one process at a time). Copy of ts7/tools/campaign.mjs restricted to the variants
// of forms/d-named/gen.mjs (same generated code, only the linked Core differs):
//   hybrid = verbatim copy of forms/d-hybrid/lib, named = forms/d-named/lib,
//   args = named + query arguments typed by schema name (experiments/named-args/lib).
// Per variant and N: generate, then per run, each in a fresh process: TS6 tsc --extendedDiagnostics,
// TS6 tools/bench.mjs, TS6 tools/forms-bench/bench-rule.mjs, TS7 tsc (parallel and --singleThreaded),
// TS7 ts7/tools/lsp-bench.mjs. tsc under /usr/bin/time -l. Waits while the 1-min load is above 4.
// Usage: node forms/d-named/tools/campaign.mjs [--sizes "10 50 200"] [--runs 3] [label ...]
//   -> forms/d-named/results/campaign.jsonl
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = '/Users/mrekinox/Desktop/ub-typing-spike'
const form = path.join(root, 'forms/d-named')
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
const configs = [
	['d-hybrid', 'hybrid', []],
	['d-named', 'named', []],
	['d-named-args', 'args', []],
	['d-hybrid-noreg', 'hybrid', ['--no-register']],
	['d-named-noreg', 'named', ['--no-register']],
].filter(([label]) => argv.length === 0 || argv.includes(label))
const out = path.join(form, 'results/campaign.jsonl')
const append = (row) => fs.appendFileSync(out, `${JSON.stringify(row)}\n`)
const TIMEOUT = 900_000
const tsc6 = '/Users/mrekinox/Desktop/ub-small/node_modules/typescript/bin/tsc'
const tsc7 = path.join(root, 'ts7/node_modules/@typescript/typescript-darwin-x64/lib/tsc')
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
		maxRssMiB: (g(/(\d+)\s+maximum resident set size/) ?? 0) / 1024 / 1024,
		errors: codes.length,
		errorCodes: Object.fromEntries([...new Set(codes)].map((c) => [c, codes.filter((x) => x === c).length])),
	}
}
const timed = (cmd, args, cwd) => {
	const r = spawnSync('/usr/bin/time', ['-l', cmd, ...args], { cwd, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 256 * 1024 * 1024 })
	return { ...parseTsc(`${r.stdout}${r.stderr}`), status: r.status }
}
const nodeJson = (args) => {
	const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 256 * 1024 * 1024 })
	const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('{'))
	return line ? JSON.parse(line) : { failed: true, status: r.status, stderr: (r.stderr ?? '').slice(-1500) }
}
const waitCalm = async (what) => {
	for (let waited = 0; ; waited += 30) {
		const [one] = os.loadavg()
		if (one <= 4) return one
		if (waited >= 1800) throw new Error(`load still ${one} before ${what}`)
		console.log(`load ${one.toFixed(2)} > 4 before ${what}, waiting 30 s`)
		await new Promise((resolve) => setTimeout(resolve, 30_000))
	}
}
for (const n of sizes) {
	for (const [label, variant, args] of configs) {
		const load1 = await waitCalm(`${label}-${n}`)
		const gen = spawnSync('node', [path.join(form, 'gen.mjs'), String(n), '--variant', variant, ...args], { cwd: root, encoding: 'utf8' })
		if (gen.status !== 0) throw new Error(`generation failed ${label}-${n}: ${gen.stderr}`)
		const dir = gen.stdout.trim()
		for (let run = 1; run <= runs; run += 1) {
			const base = { label, n, run, load1, at: new Date().toISOString() }
			append({ ...base, tool: 'tsc6', ...timed('node', [tsc6, '-p', 'tsconfig.json', '--extendedDiagnostics'], dir) })
			append({ ...base, tool: 'ls6', ...nodeJson(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/bench.mjs'), dir]) })
			append({ ...base, tool: 'rule6', ...nodeJson(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/forms-bench/bench-rule.mjs'), dir, 'src/s0.ts']) })
			append({ ...base, tool: 'tsc7', ...timed(tsc7, ['-p', 'tsconfig.json', '--extendedDiagnostics'], dir) })
			append({ ...base, tool: 'tsc7-single', ...timed(tsc7, ['-p', 'tsconfig.json', '--extendedDiagnostics', '--singleThreaded'], dir) })
			append({ ...base, tool: 'lsp7', ...nodeJson([path.join(root, 'ts7/tools/lsp-bench.mjs'), dir]) })
		}
		console.log(`${new Date().toISOString()} done ${label}-${n} load ${os.loadavg().map((l) => l.toFixed(2)).join(' ')}`)
	}
}
