// Rule-edit scenario (fresh process), complementary to tools/bench.mjs: a language service over the
// generated project, diagnostics of usage.ts (as in bench.mjs), then an invalid edit of S0's local
// access filter (`eq('f2', false)` -> `eq('f9', false)`) in the file that holds the rule
// (src/application.ts for form L, src/s0.ts otherwise) and getSemanticDiagnostics of that file.
// A second measurement restores the rule and re-requests the same file (valid edit).
// Usage: node --expose-gc tools/forms-bench/bench-rule.mjs <gen-dir> <rule-file>   (prints one JSON line)
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('/Users/mrekinox/Desktop/ub-small/node_modules/typescript')

const dir = path.resolve(process.argv[2])
const ruleFile = path.join(dir, process.argv[3])
const config = ts.getParsedCommandLineOfConfigFile(path.join(dir, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const options = config.options
const files = new Map(config.fileNames.map((f) => [path.resolve(f), { text: fs.readFileSync(f, 'utf8'), version: 0 }]))
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
const service = ts.createLanguageService(host)
service.getProgram()
const usage = path.join(dir, 'src/usage.ts')
service.getSemanticDiagnostics(usage)
const edit = (file, from, to) => {
	const entry = files.get(file)
	if (!entry.text.includes(from)) throw new Error(`edit marker not found: ${from}`)
	entry.text = entry.text.replace(from, to)
	entry.version += 1
}
edit(ruleFile, "eq('f2', false)", "eq('f9', false)")
const invalidStart = performance.now()
const invalid = service.getSemanticDiagnostics(ruleFile)
const ruleEditMs = performance.now() - invalidStart
edit(ruleFile, "eq('f9', false)", "eq('f2', false)")
const validStart = performance.now()
const valid = service.getSemanticDiagnostics(ruleFile)
const ruleRestoreMs = performance.now() - validStart
process.stdout.write(
	`${JSON.stringify({
		dir: path.basename(dir),
		ruleFile: process.argv[3],
		ruleEditMs,
		ruleEditDiagnostics: invalid.length,
		ruleEditFirstMessage: invalid[0] ? ts.flattenDiagnosticMessageText(invalid[0].messageText, '\n').slice(0, 200) : null,
		ruleRestoreMs,
		ruleRestoreDiagnostics: valid.length,
	})}\n`,
)
