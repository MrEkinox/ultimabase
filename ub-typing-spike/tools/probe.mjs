// Language-service probe: hovers at markers and diagnostics for one-edit error cases.
// Usage: node tools/probe.mjs <variant-dir>
// Reads <variant-dir>/probe.json: { hovers: [{ file, find, offset? }], cases: [{ name, file, find, replace }],
//   completions?: [{ file, find, offset? }] (member completion names at the marker) }
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('/Users/mrekinox/Desktop/ub-small/node_modules/typescript')

export const createService = (projectDir) => {
	const configPath = path.join(projectDir, 'tsconfig.json')
	const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')) } })
	const files = new Map(config.fileNames.map((f) => [path.resolve(f), { text: fs.readFileSync(f, 'utf8'), version: 0 }]))
	const host = {
		getCompilationSettings: () => config.options,
		getScriptFileNames: () => [...files.keys()],
		getScriptVersion: (f) => String(files.get(path.resolve(f))?.version ?? 0),
		getScriptSnapshot: (f) => {
			const entry = files.get(path.resolve(f))
			if (entry) return ts.ScriptSnapshot.fromString(entry.text)
			return fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined
		},
		getCurrentDirectory: () => projectDir,
		getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	}
	const service = ts.createLanguageService(host, ts.createDocumentRegistry())
	const edit = (file, text) => {
		const entry = files.get(path.resolve(file))
		entry.text = text
		entry.version += 1
	}
	const text = (file) => files.get(path.resolve(file)).text
	const diagnostics = () => {
		const out = []
		for (const f of files.keys()) {
			for (const d of [...service.getSyntacticDiagnostics(f), ...service.getSemanticDiagnostics(f)]) {
				const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 }
				out.push({ file: path.relative(projectDir, f), line: pos.line + 1, col: pos.character + 1, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') })
			}
		}
		return out
	}
	const hover = (file, position) => {
		const info = service.getQuickInfoAtPosition(path.resolve(file), position)
		return info ? ts.displayPartsToString(info.displayParts) : '(none)'
	}
	return { service, edit, text, diagnostics, hover, files }
}

const main = () => {
	const dir = path.resolve(process.argv[2])
	const spec = JSON.parse(fs.readFileSync(path.join(dir, 'probe.json'), 'utf8'))
	const ls = createService(dir)
	const base = ls.diagnostics()
	console.log(`# ${path.basename(dir)}\n\nBaseline diagnostics: ${base.length}`)
	for (const d of base) console.log(`  ${d.file}:${d.line}:${d.col} TS${d.code} ${d.message.split('\n')[0].slice(0, 200)}`)
	console.log('\n## Hovers')
	for (const h of spec.hovers) {
		const file = path.join(dir, h.file)
		const index = ls.text(file).indexOf(h.find)
		if (index < 0) throw new Error(`marker not found: ${h.find}`)
		const text = ls.hover(file, index + (h.offset ?? 0))
		console.log(`\n### ${h.file} \`${h.find}\` (${text.length} chars)\n\n\`\`\`\n${text}\n\`\`\``)
	}
	for (const c of spec.completions ?? []) {
		const file = path.join(dir, c.file)
		const index = ls.text(file).indexOf(c.find)
		if (index < 0) throw new Error(`completion marker not found: ${c.find}`)
		const result = ls.service.getCompletionsAtPosition(path.resolve(file), index + (c.offset ?? c.find.length), {})
		const names = (result?.entries ?? []).filter((e) => e.kind !== 'keyword').map((e) => e.name)
		console.log(`\n### completions ${c.file} \`${c.find}\` (${names.length})\n\n${names.join(', ')}`)
	}
	console.log('\n## Error cases')
	for (const c of spec.cases) {
		const file = path.join(dir, c.file)
		const original = ls.text(file)
		if (!original.includes(c.find)) throw new Error(`case marker not found: ${c.find}`)
		ls.edit(file, original.replace(c.find, c.replace))
		const diags = ls.diagnostics()
		ls.edit(file, original)
		console.log(`\n### ${c.name} (${c.file}: \`${c.find}\` -> \`${c.replace}\`): ${diags.length} diagnostic(s)\n`)
		for (const d of diags) console.log(`- ${d.file}:${d.line}:${d.col} TS${d.code}: ${d.message.replace(/\n/g, ' / ').slice(0, 600)}`)
	}
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main()
