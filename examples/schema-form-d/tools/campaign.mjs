// Sequential benchmark campaign of form D on the real packages against the real
// Typegen baseline, with the method of ub-typing-spike/forms/BENCH.md: one
// process at a time, fresh process per run, waits while the 1-min load is > 4.
// Per N and run: TypeScript 6 `tsc --extendedDiagnostics` (under /usr/bin/time),
// TypeScript 7 `tsc` (parallel and --singleThreaded), the TS6 language-service
// bench (cold, edits, hover, heap) and rule edit, the TS7 LSP bench. Typegen:
// the real-baseline editor probe (TS6) and its program written to disk for tsc.
// Usage: node tools/campaign.mjs [--sizes "10 50 200"] [--runs 3] [labels...]
//   labels: form-d, form-d-noreg, typegen   -> results/campaign.jsonl
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
import { setTimeout } from 'node:timers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { generate } from './gen.mjs'

const exampleDir = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'..',
)
const argv = process.argv.slice(2)
const option = (name, fallback) => {
	const index = argv.indexOf(name)
	return index === -1 ? fallback : argv.splice(index, 2)[1]
}
const sizes = option('--sizes', '10 50 200')
	.split(/\s+/)
	.filter(Boolean)
	.map(Number)
const runs = Number(option('--runs', '3'))
const scratch = option(
	'--scratch',
	path.join(os.tmpdir(), 'schema-form-d-campaign'),
)
const labels = argv.length > 0 ? argv : ['form-d', 'form-d-noreg', 'typegen']
const out = path.join(exampleDir, 'results/campaign.jsonl')
const tsc6 = '/Users/mrekinox/Desktop/ub-slice/node_modules/typescript/bin/tsc'
const tsc6Main =
	'/Users/mrekinox/Desktop/ub-small/node_modules/typescript/bin/tsc'
const tsc7 =
	'/Users/mrekinox/Desktop/ub-typing-spike/ts7/node_modules/@typescript/typescript-darwin-x64/lib/tsc'
const realBaseline =
	'/Users/mrekinox/Desktop/ub-typing-spike/tools/real-baseline'
const TIMEOUT = 1_800_000

const append = (row) =>
	fs.appendFileSync(
		out,
		`${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`,
	)
const parseTsc = (text) => {
	const read = (pattern) => {
		const match = text.match(pattern)
		return match ? Number(match[1]) : null
	}
	const codes = [...text.matchAll(/error (TS\d+)/g)].map((match) => match[1])
	return {
		checkS: read(/Check time:\s+([\d.]+)s/),
		totalS: read(/Total time:\s+([\d.]+)s/),
		realS: read(/([\d.]+) real/),
		instantiations: read(/Instantiations:\s+(\d+)/),
		types: read(/Types:\s+(\d+)/),
		memoryK: read(/Memory used:\s+(\d+)K/),
		maxRssMiB: (read(/(\d+)\s+maximum resident set size/) ?? 0) / 1024 / 1024,
		errors: codes.length,
	}
}
const timed = (command, args) => {
	const result = spawnSync('/usr/bin/time', ['-l', command, ...args], {
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		timeout: TIMEOUT,
	})
	return {
		...parseTsc(`${result.stdout}${result.stderr}`),
		status: result.status,
	}
}
const nodeJson = (args, cwd = exampleDir) => {
	const result = spawnSync(
		'node',
		['--expose-gc', '--max-old-space-size=12288', ...args],
		{
			cwd,
			encoding: 'utf8',
			maxBuffer: 256 * 1024 * 1024,
			timeout: TIMEOUT,
		},
	)
	const line = (result.stdout ?? '')
		.split('\n')
		.find((entry) => entry.startsWith('{'))
	return line
		? JSON.parse(line)
		: {
				failed: true,
				status: result.status,
				stderr: (result.stderr ?? '').slice(-1500),
			}
}
const waitCalm = async (what) => {
	for (let waited = 0; ; waited += 30) {
		const [one, five] = os.loadavg()
		if (one <= 4) return { load1: one, load5: five, waitedS: waited }
		if (waited >= 1800)
			throw new Error(`load ${one.toFixed(2)} after 30 min before ${what}`)
		console.log(`load ${one.toFixed(2)} > 4 before ${what}, waiting 30 s`)
		await new Promise((resolve) => setTimeout(resolve, 30_000))
	}
}

for (const n of sizes) {
	for (const label of labels) {
		const load = await waitCalm(`${label}-${n}`)
		if (label === 'typegen') {
			const dumpDir = path.join(scratch, `typegen-${n}`)
			const dumped = nodeJson([
				path.join(exampleDir, 'tools/typegen-dump.mjs'),
				String(n),
				dumpDir,
			])
			for (let run = 1; run <= runs; run += 1) {
				const config = path.join(dumpDir, 'tsconfig.json')
				append({
					label,
					n,
					run,
					...load,
					kind: 'probe-ts6',
					...nodeJson(['probe.mjs', String(n)], realBaseline),
				})
				append({
					label,
					n,
					run,
					kind: 'tsc6',
					...timed('node', [tsc6Main, '-p', config, '--extendedDiagnostics']),
				})
				append({
					label,
					n,
					run,
					kind: 'tsc7',
					...timed(tsc7, ['-p', config, '--extendedDiagnostics']),
				})
				append({
					label,
					n,
					run,
					kind: 'tsc7-single',
					...timed(tsc7, [
						'-p',
						config,
						'--extendedDiagnostics',
						'--singleThreaded',
					]),
				})
			}
			append({ label, n, kind: 'dump', ...dumped })
		} else {
			const dir = generate(n, { register: label === 'form-d' })
			const config = path.join(dir, 'tsconfig.json')
			for (let run = 1; run <= runs; run += 1) {
				append({
					label,
					n,
					run,
					...load,
					kind: 'tsc6',
					...timed('node', [tsc6, '-p', config, '--extendedDiagnostics']),
				})
				append({
					label,
					n,
					run,
					kind: 'tsc7',
					...timed(tsc7, ['-p', config, '--extendedDiagnostics']),
				})
				append({
					label,
					n,
					run,
					kind: 'tsc7-single',
					...timed(tsc7, [
						'-p',
						config,
						'--extendedDiagnostics',
						'--singleThreaded',
					]),
				})
				append({
					label,
					n,
					run,
					kind: 'bench6',
					...nodeJson([path.join(exampleDir, 'tools/bench.mjs'), dir]),
				})
				append({
					label,
					n,
					run,
					kind: 'rule6',
					...nodeJson([
						path.join(exampleDir, 'tools/bench-rule.mjs'),
						dir,
						'src/s0.ts',
					]),
				})
				append({
					label,
					n,
					run,
					kind: 'lsp7',
					...nodeJson([path.join(exampleDir, 'tools/lsp-bench.mjs'), dir]),
				})
			}
		}
		console.log(
			`done ${label}-${n} load ${os
				.loadavg()
				.map((value) => value.toFixed(2))
				.join(' ')}`,
		)
	}
}
