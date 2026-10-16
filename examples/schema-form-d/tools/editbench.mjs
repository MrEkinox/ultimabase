// Interleaved edit-to-diagnostics bench of generated projects (ADR-0297
// thresholds): tools/bench.mjs on TypeScript 6 and tools/lsp-bench.mjs on
// TypeScript 7, each run in a fresh process once the 1-minute load average is
// below 4. Ported from the spike branch spike/define-features-with-builder.
// Usage: node tools/editbench.mjs <reps> <sizes,comma> <label=exampleDir:form>...
//   (one JSON line per run; the generated projects are <exampleDir>/gen/<form>-<n>)
import process from 'node:process'
import console from 'node:console'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const [reps, sizes, ...variants] = process.argv.slice(2)
const sleep = (ms) =>
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const waitCalm = () => {
	let waited = 0
	while (os.loadavg()[0] >= 4) {
		sleep(15_000)
		waited += 15
	}
	return waited
}
const runners = [
	['ts6', ['--expose-gc', 'tools/bench.mjs']],
	['ts7', ['tools/lsp-bench.mjs']],
]
for (let rep = 0; rep < Number(reps); rep += 1) {
	for (const n of sizes.split(',')) {
		for (const variant of variants) {
			const [label, target] = variant.split('=')
			const [exampleDir, form] = target.split(':')
			for (const [ts, args] of runners) {
				const waited = waitCalm()
				const load = Number(os.loadavg()[0].toFixed(2))
				const result = spawnSync(
					process.execPath,
					[...args, path.join('gen', `${form}-${n}`)],
					{
						cwd: exampleDir,
						encoding: 'utf8',
						maxBuffer: 1 << 26,
						timeout: 1_800_000,
					},
				)
				let row
				try {
					row = JSON.parse(result.stdout.trim().split('\n').pop())
				} catch {
					row = { error: (result.stderr || result.stdout || '').slice(0, 300) }
				}
				console.log(
					JSON.stringify({
						rep,
						n: Number(n),
						label,
						ts,
						load,
						loadAfter: Number(os.loadavg()[0].toFixed(2)),
						waited,
						editToDiagnosticMs: row.editToDiagnosticMs ?? null,
						initialUsageDiagnostics: row.initialUsageDiagnostics ?? null,
						editDiagnostics: row.editDiagnostics ?? null,
						error: row.error ?? null,
					}),
				)
			}
		}
	}
}
