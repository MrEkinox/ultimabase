// One isolated measurement of a generated application (run in a fresh process).
// Mirrors packages/typegen/tests/performance/fixtures/editor-probe-runner.mjs:
// cold = createProgram + getPreEmitDiagnostics; then a language service, an edit of a
// query literal ('valid' -> 42) and getSemanticDiagnostics of the edited file.
// Adds a schema edit (one field type change in s0.ts) re-requesting diagnostics of the
// schema file and of usage.ts, plus a hover.
// Usage: node --expose-gc tools/bench.mjs <gen-dir>   (prints one JSON line)
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('/Users/mrekinox/Desktop/ub-small/node_modules/typescript')

const dir = path.resolve(process.argv[2])
let peak = process.memoryUsage().heapUsed
const sample = () => {
	peak = Math.max(peak, process.memoryUsage().heapUsed)
}
const config = ts.getParsedCommandLineOfConfigFile(path.join(dir, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const options = config.options
const files = new Map(config.fileNames.map((f) => [path.resolve(f), { text: fs.readFileSync(f, 'utf8'), version: 0 }]))

const coldStart = performance.now()
const program = ts.createProgram({ rootNames: [...files.keys()], options })
const coldDiagnostics = ts.getPreEmitDiagnostics(program)
const coldMs = performance.now() - coldStart
sample()

const host = {
	getCompilationSettings: () => options,
	getScriptFileNames: () => [...files.keys()],
	getScriptVersion: (f) => String(files.get(path.resolve(f))?.version ?? 0),
	getScriptSnapshot: (f) => {
		const entry = files.get(path.resolve(f))
		const text = entry ? entry.text : ts.sys.readFile(f)
		return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
	},
	getCurrentDirectory: () => dir,
	getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
	fileExists: ts.sys.fileExists,
	readFile: ts.sys.readFile,
}
const lsStart = performance.now()
const service = ts.createLanguageService(host)
service.getProgram()
const lsInitMs = performance.now() - lsStart
const usage = path.join(dir, 'src/usage.ts')
const schema0 = path.join(dir, 'src/s0.ts')
const firstStart = performance.now()
const initialUsageDiagnostics = service.getSemanticDiagnostics(usage)
const firstUsageDiagnosticMs = performance.now() - firstStart
sample()
const hoverAt = () => {
	const text = files.get(usage).text
	const info = service.getQuickInfoAtPosition(usage, text.indexOf('hoverProbe = q0') + 'hoverProbe = '.length)
	return ts.displayPartsToString(info?.displayParts ?? [])
}
const hover = hoverAt()

const edit = (file, from, to) => {
	const entry = files.get(file)
	if (!entry.text.includes(from)) throw new Error(`edit marker not found: ${from}`)
	entry.text = entry.text.replace(from, to)
	entry.version += 1
}

// Edit 1: invalid query literal, as in the Typegen probe.
edit(usage, "eq: 'valid'", 'eq: 42     ')
const editStart = performance.now()
const editDiagnostics = service.getSemanticDiagnostics(usage)
const editToDiagnosticMs = performance.now() - editStart
sample()
// Upper bound comparable to the single-file Typegen probe: every file re-checked.
const editAllStart = performance.now()
let editAllDiagnostics = 0
for (const f of files.keys()) editAllDiagnostics += service.getSemanticDiagnostics(f).length
const editAllFilesMs = performance.now() - editAllStart + editToDiagnosticMs
sample()

// Edit 2: change one schema field, re-request diagnostics of the schema and usage + a hover.
edit(usage, 'eq: 42     ', "eq: 'valid'")
edit(schema0, 'f5: field.string(),', 'f5: field.int(),   ')
const schemaEditStart = performance.now()
const schemaDiagnostics = service.getSemanticDiagnostics(schema0)
const usageAfterSchemaEdit = service.getSemanticDiagnostics(usage)
const hoverAfterEdit = hoverAt()
const schemaEditMs = performance.now() - schemaEditStart
sample()

globalThis.gc?.()
const memory = process.memoryUsage()
process.stdout.write(
	`${JSON.stringify({
		dir: path.basename(dir),
		coldMs,
		coldDiagnostics: coldDiagnostics.length,
		lsInitMs,
		firstUsageDiagnosticMs,
		initialUsageDiagnostics: initialUsageDiagnostics.length,
		editToDiagnosticMs,
		editDiagnostics: editDiagnostics.length,
		editAllFilesMs,
		editAllDiagnostics,
		schemaEditMs,
		schemaEditDiagnostics: schemaDiagnostics.length + usageAfterSchemaEdit.length,
		hoverChars: hover.length,
		hoverAfterEditChars: hoverAfterEdit.length,
		peakHeapMiB: peak / 1024 / 1024,
		rssMiB: memory.rss / 1024 / 1024,
	})}\n`,
)
