// Interleaved `tsc --extendedDiagnostics` runs of generated projects on
// TypeScript 6 and 7 (instantiations, types, check time), each once the
// 1-minute load average is below 4. Ported from the spike branch
// spike/define-features-with-builder.
// Usage: node tools/measure.mjs <reps> <label=repoRoot:projectDir>...
import process from 'node:process'
import console from 'node:console'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const [reps, ...variants] = process.argv.slice(2)
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
const read = (output, pattern) => {
	const match = output.match(pattern)
	return match === null ? null : Number(match[1].replaceAll(',', ''))
}
for (let rep = 0; rep < Number(reps); rep += 1) {
	for (const variant of variants) {
		const [label, target] = variant.split('=')
		const [root, project] = target.split(':')
		for (const ts of ['ts6', 'ts7']) {
			const compiler = path.join(
				root,
				'node_modules',
				ts === 'ts6' ? 'typescript' : 'typescript-7',
				'bin/tsc',
			)
			const waited = waitCalm()
			const load = Number(os.loadavg()[0].toFixed(2))
			const result = spawnSync(
				process.execPath,
				[
					compiler,
					'-p',
					path.join(project, 'tsconfig.json'),
					'--extendedDiagnostics',
					'--pretty',
					'false',
				],
				{ encoding: 'utf8', maxBuffer: 1 << 26 },
			)
			const output = result.stdout
			console.log(
				JSON.stringify({
					rep,
					label,
					ts,
					load,
					waited,
					errors: (output.match(/error TS/g) ?? []).length,
					instantiations: read(output, /Instantiations:\s+([\d,]+)/),
					types: read(output, /Types:\s+([\d,]+)/),
					checkS: read(output, /Check time:\s+([\d.]+)s/),
				}),
			)
		}
	}
}
