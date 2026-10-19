// Copy of tools/probe.mjs extended for the form comparison protocol.
// Usage: node forms/<id>/tools/probe.mjs <project-dir> [probe.json]
// probe.json: {
//   hovers: [{ name?, file, find, offset? }],
//   hoverSets?: [{ name, edits: [{ file, find, replace }] }]   (hovers re-measured after the edits)
//   completions?: [{ name?, file, find, offset? }]
//   cases: [{ name, file, find, replace, line?, alsoEdits? }]   (line: text locating the faulty line, default `replace`)
// }
// For each case: diagnostic count, whether one is on the faulty line, and the primary message
// (the one on the faulty line if any, else the first one) with its length.
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
		realpath: ts.sys.realpath,
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

const lineOf = (text, index) => text.slice(0, index).split('\n').length

const main = () => {
	const dir = path.resolve(process.argv[2])
	const spec = JSON.parse(fs.readFileSync(process.argv[3] ? path.resolve(process.argv[3]) : path.join(dir, 'probe.json'), 'utf8'))
	const ls = createService(dir)
	const base = ls.diagnostics()
	console.log(`# ${path.basename(path.dirname(dir))}/${path.basename(dir)}\n\nBaseline diagnostics: ${base.length}`)
	for (const d of base) console.log(`  ${d.file}:${d.line}:${d.col} TS${d.code} ${d.message.split('\n')[0].slice(0, 300)}`)
	const applyEdits = (edits) => {
		const originals = edits.map((e) => {
			const file = path.join(dir, e.file)
			const original = ls.text(file)
			if (!original.includes(e.find)) throw new Error(`edit marker not found: ${e.find}`)
			ls.edit(file, original.replace(e.find, e.replace))
			return [file, original]
		})
		return () => { for (const [file, original] of originals.reverse()) ls.edit(file, original) }
	}
	const printHovers = (title) => {
		console.log(`\n## Hovers${title}\n\n| Point | Length | Text (first line) |\n| --- | --- | --- |`)
		const full = []
		for (const h of spec.hovers) {
			const file = path.join(dir, h.file)
			const index = ls.text(file).indexOf(h.find)
			if (index < 0) throw new Error(`marker not found: ${h.find}`)
			const text = ls.hover(file, index + (h.offset ?? 0))
			console.log(`| ${h.name ?? h.find} | ${text.length} | \`${text.split('\n')[0].slice(0, 140).replace(/\|/g, '\\|')}\` |`)
			full.push(`### ${h.name ?? h.find} — ${h.file} \`${h.find}\` (${text.length} chars)\n\n\`\`\`\n${text}\n\`\`\``)
		}
		console.log(`\n${full.join('\n\n')}`)
	}
	printHovers('')
	for (const set of spec.hoverSets ?? []) {
		const restore = applyEdits(set.edits)
		const diags = ls.diagnostics()
		printHovers(` — ${set.name} (${diags.length} diagnostic(s))`)
		restore()
	}
	for (const c of spec.completions ?? []) {
		const file = path.join(dir, c.file)
		const index = ls.text(file).indexOf(c.find)
		if (index < 0) throw new Error(`completion marker not found: ${c.find}`)
		const result = ls.service.getCompletionsAtPosition(path.resolve(file), index + (c.offset ?? c.find.length), {})
		const names = (result?.entries ?? []).filter((e) => e.kind !== 'keyword').map((e) => e.name)
		console.log(`\n### completions ${c.name ?? ''} ${c.file} \`${JSON.stringify(c.find)}\` (${names.length})\n\n${names.join(', ')}`)
	}
	console.log('\n## Error cases\n\n| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |\n| --- | --- | --- | --- | --- | --- |')
	const details = []
	spec.cases.forEach((c, i) => {
		const file = path.join(dir, c.file)
		const original = ls.text(file)
		const index = original.indexOf(c.find)
		if (index < 0) throw new Error(`case marker not found: ${c.find}`)
		const edited = original.replace(c.find, c.replace)
		const faultyLine = lineOf(edited, edited.indexOf(c.line ?? c.replace, Math.max(0, index - 200)))
		ls.edit(file, edited)
		// Optional extra edits (other files) applied together with the main one.
		const restoreExtra = applyEdits(c.alsoEdits ?? [])
		const diags = ls.diagnostics()
		restoreExtra()
		ls.edit(file, original)
		const onLine = diags.filter((d) => d.file === c.file && d.line === faultyLine)
		const primary = onLine[0] ?? diags[0]
		const where = onLine.length > 0 ? 'yes' : diags.length > 0 ? `no (${diags[0].file}:${diags[0].line})` : '—'
		const msg = primary ? primary.message.replace(/\n/g, ' / ') : ''
		console.log(`| ${i + 1} | ${c.name} | ${diags.length > 0 ? 'yes' : 'NO'} | ${where} | ${diags.length} | ${primary ? `TS${primary.code} (${primary.message.length})` : '—'} |`)
		details.push(`### ${i + 1}. ${c.name} (${c.file}:${faultyLine}: \`${c.find}\` -> \`${c.replace}\`): ${diags.length} diagnostic(s)\n\nPrimary: ${primary ? `TS${primary.code} ${msg}` : '(none)'}\n\n${diags.map((d) => `- ${d.file}:${d.line}:${d.col} TS${d.code}: ${d.message.replace(/\n/g, ' / ').slice(0, 700)}`).join('\n')}`)
	})
	console.log(`\n${details.join('\n\n')}`)
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main()
