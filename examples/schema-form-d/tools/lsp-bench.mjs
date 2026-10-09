// Copy of ub-typing-spike/ts7/tools/lsp-bench.mjs.
// TS7 counterpart of tools/bench.mjs + tools/forms-bench/bench-rule.mjs, through the native
// LSP server (TypeScript 7 has no JS language service). One fresh server per run.
// Scenario: open every project file; first diagnostics of usage.ts (server-side project load +
// check) = "first"; hover q0; query edit ('valid' -> 42) then diagnostics of usage.ts
// ("edit->diag") then of every file ("edit->all"); restore, schema edit in s0.ts
// (f5 string -> int) then diagnostics of s0.ts + usage.ts + hover ("schema+hover"); restore,
// rule edit in s0.ts (eq('f2' -> eq('f9') then diagnostics of s0.ts ("rule").
// Usage: node ts7/tools/lsp-bench.mjs <gen-dir>   (prints one JSON line)
import process from 'node:process'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
	startServer,
	hoverCode,
} from '/Users/mrekinox/Desktop/ub-typing-spike/ts7/tools/lsp.mjs'

const dir = path.resolve(process.argv[2])
const src = path.join(dir, 'src')
const files = fs
	.readdirSync(src)
	.filter((f) => f.endsWith('.ts'))
	.map((f) => path.join(src, f))
const usage = path.join(src, 'usage.ts')
const s0 = path.join(src, 's0.ts')
const errors = (items) =>
	items.filter((d) => d.severity === undefined || d.severity <= 2)
const now = () => performance.now()

const startAt = now()
const server = await startServer(dir)
for (const f of files) server.open(f)
let t = now()
const first = errors(await server.diagnostics(usage))
const firstMs = now() - t
const firstTotalMs = now() - startAt
const hoverAt = async () => {
	const text = server.text(usage)
	return hoverCode(
		await server.hover(
			usage,
			text.indexOf('hoverProbe = q0') + 'hoverProbe = '.length,
		),
	)
}
const hover = await hoverAt()
const edit = (file, from, to) => {
	const text = server.text(file)
	if (!text.includes(from)) throw new Error(`edit marker not found: ${from}`)
	server.change(file, text.replace(from, to))
}
edit(usage, "eq: 'valid'", 'eq: 42     ')
t = now()
const editDiagnostics = errors(await server.diagnostics(usage))
const editToDiagnosticMs = now() - t
t = now()
let editAllDiagnostics = 0
for (const f of files)
	editAllDiagnostics += errors(await server.diagnostics(f)).length
const editAllFilesMs = now() - t + editToDiagnosticMs
edit(usage, 'eq: 42     ', "eq: 'valid'")
edit(s0, 'f5: field.string(),', 'f5: field.int(),   ')
t = now()
const schemaDiagnostics =
	errors(await server.diagnostics(s0)).length +
	errors(await server.diagnostics(usage)).length
const hoverAfterEdit = await hoverAt()
const schemaEditMs = now() - t
edit(s0, 'f5: field.int(),   ', 'f5: field.string(),')
await server.diagnostics(s0)
edit(s0, "eq('f2', false)", "eq('f9', false)")
t = now()
const rule = errors(await server.diagnostics(s0))
const ruleEditMs = now() - t
let rssMiB = null
try {
	rssMiB =
		Number(
			execFileSync('ps', ['-o', 'rss=', '-p', String(server.child.pid)], {
				encoding: 'utf8',
			}).trim(),
		) / 1024
} catch {
	// The server may already have exited; RSS is then unknown.
}
await server.close()
process.stdout.write(
	`${JSON.stringify({
		dir: path.basename(dir),
		firstMs,
		firstTotalMs,
		initialUsageDiagnostics: first.length,
		editToDiagnosticMs,
		editDiagnostics: editDiagnostics.length,
		editFirstMessage:
			editDiagnostics[0]?.message.split('\n')[0].slice(0, 160) ?? null,
		editAllFilesMs,
		editAllDiagnostics,
		schemaEditMs,
		schemaEditDiagnostics: schemaDiagnostics,
		ruleEditMs,
		ruleEditDiagnostics: rule.length,
		hoverChars: hover.length,
		hoverAfterEditChars: hoverAfterEdit.length,
		serverRssMiB: rssMiB,
	})}\n`,
)
