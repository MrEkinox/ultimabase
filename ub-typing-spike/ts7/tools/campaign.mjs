// Sequential TS6 vs TS7 campaign over the finalist generators (equal density, BENCH.md flags).
// Per configuration and N: generate (forms/<id>/gen.mjs), then per run, each in a fresh process:
// TS6 tsc --extendedDiagnostics, TS7 tsc --extendedDiagnostics (default, parallel checkers),
// TS7 tsc --singleThreaded, TS6 tools/bench.mjs + tools/forms-bench/bench-rule.mjs (language
// service), TS7 ts7/tools/lsp-bench.mjs (native LSP). All tsc runs under /usr/bin/time -l.
// Runs: 3 at N = 200, 1 otherwise. Waits while the 1-min load is above 4.
// Usage: node ts7/tools/campaign.mjs [--sizes "10 50 200"] [label ...]  -> ts7/results/campaign.jsonl
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = '/Users/mrekinox/Desktop/ub-typing-spike'
const argv = process.argv.slice(2)
const si = argv.indexOf('--sizes')
const sizes = si >= 0 ? argv.splice(si, 2)[1].split(/\s+/).map(Number) : [10, 50, 200]
const configs = [
	['d-hybrid', 'd-hybrid', [], 'd-hybrid'],
	['d-hybrid-noreg', 'd-hybrid', ['--no-register'], 'd-hybrid-noreg'],
	['e1-annotated', 'e1-annotated', [], 'e1-annotated'],
	['e2-this-with', 'e2-this-with', [], 'e2-this-with'],
	['k-rules-list', 'k-rules-list', [], 'k-rules-list'],
	['e3-static-block', 'e3-static-block', [], 'e3-static-block'],
	['g-class', 'g-class', [], 'g-class'],
].filter(([label]) => argv.length === 0 || argv.includes(label))
const out = path.join(root, 'ts7/results/campaign.jsonl')
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
		realS: g(/([\d.]+) real/),
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
	for (const [label, form, args, dirName] of configs) {
		const load1 = await waitCalm(`${label}-${n}`)
		const gen = spawnSync('node', [path.join(root, 'forms', form, 'gen.mjs'), String(n), ...args], { cwd: root, encoding: 'utf8' })
		if (gen.status !== 0) throw new Error(`generation failed ${label}-${n}: ${gen.stderr}`)
		const dir = path.join(root, 'forms', form, 'gen', `${dirName}-${n}`)
		const runs = n >= 200 ? 3 : 1
		for (let run = 1; run <= runs; run += 1) {
			const base = { label, n, run, load1, at: new Date().toISOString() }
			append({ ...base, tool: 'tsc6', ...timed('node', [tsc6, '-p', 'tsconfig.json', '--extendedDiagnostics'], dir) })
			append({ ...base, tool: 'tsc7', ...timed(tsc7, ['-p', 'tsconfig.json', '--extendedDiagnostics'], dir) })
			append({ ...base, tool: 'tsc7-single', ...timed(tsc7, ['-p', 'tsconfig.json', '--extendedDiagnostics', '--singleThreaded'], dir) })
			append({ ...base, tool: 'ls6', ...nodeJson(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/bench.mjs'), dir]) })
			append({ ...base, tool: 'rule6', ...nodeJson(['--expose-gc', '--max-old-space-size=12288', path.join(root, 'tools/forms-bench/bench-rule.mjs'), dir, 'src/s0.ts']) })
			append({ ...base, tool: 'lsp7', ...nodeJson([path.join(root, 'ts7/tools/lsp-bench.mjs'), dir]) })
		}
		console.log(`${new Date().toISOString()} done ${label}-${n} load ${os.loadavg().map((l) => l.toFixed(2)).join(' ')}`)
	}
}
