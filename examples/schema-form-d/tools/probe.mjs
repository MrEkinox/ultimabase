// Copy of ub-typing-spike/ts7/tools/probe-both.mjs (TypeScript 6 from this repository).
// (JS language service, like forms/d-hybrid/tools/probe.mjs) or TypeScript 7.0.2
// (native LSP server, see lsp.mjs). Prints one JSON document.
// Usage: node ts7/tools/probe-both.mjs <6|7> <project-dir> [probe.json] [tsconfig-name]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
	startServer,
	hoverCode,
} from '/Users/mrekinox/Desktop/ub-typing-spike/ts7/tools/lsp.mjs'

const require = createRequire(import.meta.url)
const ts6 = require('/Users/mrekinox/Desktop/ub-slice/node_modules/typescript')

const version = process.argv[2]
const dir = path.resolve(process.argv[3])
const spec = JSON.parse(
	fs.readFileSync(
		process.argv[4]
			? path.resolve(process.argv[4])
			: path.join(dir, 'probe.json'),
		'utf8',
	),
)
const configName = process.argv[5] ?? 'tsconfig.json'
// File list only (no type checking): parsed with TS6, identical include semantics.
const config = ts6.getParsedCommandLineOfConfigFile(
	path.join(dir, configName),
	{},
	{
		...ts6.sys,
		onUnRecoverableConfigFileDiagnostic: (d) => {
			throw new Error(ts6.flattenDiagnosticMessageText(d.messageText, '\n'))
		},
	},
)
const fileNames = config.fileNames.map((f) => path.resolve(f))
const lineOf = (text, index) => text.slice(0, index).split('\n').length

const makeTs6 = () => {
	const files = new Map(
		fileNames.map((f) => [f, { text: fs.readFileSync(f, 'utf8'), version: 0 }]),
	)
	const host = {
		getCompilationSettings: () => ({
			...config.options,
			...JSON.parse(process.env.TS6_OPTIONS ?? '{}'),
		}),
		getScriptFileNames: () => [...files.keys()],
		getScriptVersion: (f) => String(files.get(path.resolve(f))?.version ?? 0),
		getScriptSnapshot: (f) => {
			const entry = files.get(path.resolve(f))
			if (entry) return ts6.ScriptSnapshot.fromString(entry.text)
			return fs.existsSync(f)
				? ts6.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8'))
				: undefined
		},
		getCurrentDirectory: () => dir,
		getDefaultLibFileName: (o) => ts6.getDefaultLibFilePath(o),
		fileExists: ts6.sys.fileExists,
		readFile: ts6.sys.readFile,
		readDirectory: ts6.sys.readDirectory,
		directoryExists: ts6.sys.directoryExists,
		getDirectories: ts6.sys.getDirectories,
		realpath: ts6.sys.realpath,
	}
	const service = ts6.createLanguageService(host, ts6.createDocumentRegistry())
	return {
		text: (f) => files.get(path.resolve(f)).text,
		edit: (f, text) => {
			const e = files.get(path.resolve(f))
			e.text = text
			e.version += 1
		},
		diagnostics: async () => {
			const out = []
			for (const f of files.keys()) {
				for (const d of [
					...service.getSyntacticDiagnostics(f),
					...service.getSemanticDiagnostics(f),
				]) {
					const pos =
						d.file && d.start !== undefined
							? d.file.getLineAndCharacterOfPosition(d.start)
							: { line: 0, character: 0 }
					out.push({
						file: path.relative(dir, f),
						line: pos.line + 1,
						col: pos.character + 1,
						code: d.code,
						message: ts6.flattenDiagnosticMessageText(d.messageText, '\n'),
					})
				}
			}
			return out
		},
		hover: async (f, pos) => {
			const info = service.getQuickInfoAtPosition(path.resolve(f), pos)
			return info ? ts6.displayPartsToString(info.displayParts) : '(none)'
		},
		completions: async (f, pos) =>
			(
				service.getCompletionsAtPosition(
					path.resolve(f),
					pos,
					JSON.parse(process.env.TS6_COMPLETION ?? '{}'),
				)?.entries ?? []
			)
				.filter((e) => e.kind !== 'keyword')
				.map((e) => e.name),
		close: async () => {},
	}
}

const makeTs7 = async () => {
	const server = await startServer(dir)
	for (const f of fileNames) server.open(f)
	return {
		text: (f) => server.text(f),
		edit: (f, text) => server.change(f, text),
		diagnostics: async () => {
			const out = []
			for (const f of fileNames) {
				for (const d of await server.diagnostics(f)) {
					// Errors and warnings only, like getSyntactic+getSemanticDiagnostics (no suggestions/hints).
					if (d.severity !== undefined && d.severity > 2) continue
					out.push({
						file: path.relative(dir, f),
						line: d.range.start.line + 1,
						col: d.range.start.character + 1,
						code: Number(d.code),
						message: d.message,
					})
				}
			}
			return out
		},
		hover: async (f, pos) => hoverCode(await server.hover(f, pos)),
		completions: async (f, pos) => {
			const r = await server.completion(f, pos)
			const items = Array.isArray(r) ? r : (r?.items ?? [])
			// LSP CompletionItemKind.Keyword = 14
			return items.filter((i) => i.kind !== 14).map((i) => i.label)
		},
		close: () => server.close(),
	}
}

const ls = version === '7' ? await makeTs7() : makeTs6()
const result = {
	version,
	dir,
	baseline: [],
	hovers: [],
	hoverSets: [],
	completions: [],
	cases: [],
}
result.baseline = await ls.diagnostics()
const applyEdits = (edits) => {
	const originals = edits.map((e) => {
		const file = path.join(dir, e.file)
		const original = ls.text(file)
		if (!original.includes(e.find))
			throw new Error(`edit marker not found: ${e.find}`)
		ls.edit(file, original.replace(e.find, e.replace))
		return [file, original]
	})
	return () => {
		for (const [file, original] of originals.reverse()) ls.edit(file, original)
	}
}
const hovers = async () => {
	const out = []
	for (const h of spec.hovers) {
		const file = path.join(dir, h.file)
		const index = ls.text(file).indexOf(h.find)
		if (index < 0) throw new Error(`marker not found: ${h.find}`)
		const text = await ls.hover(file, index + (h.offset ?? 0))
		out.push({ name: h.name ?? h.find, text, length: text.length })
	}
	return out
}
result.hovers = await hovers()
for (const set of spec.hoverSets ?? []) {
	const restore = applyEdits(set.edits)
	const diags = await ls.diagnostics()
	result.hoverSets.push({
		name: set.name,
		diagnostics: diags.length,
		hovers: await hovers(),
	})
	restore()
}
for (const c of spec.completions ?? []) {
	const file = path.join(dir, c.file)
	const index = ls.text(file).indexOf(c.find)
	if (index < 0) throw new Error(`completion marker not found: ${c.find}`)
	const names = await ls.completions(file, index + (c.offset ?? c.find.length))
	result.completions.push({ name: c.name ?? c.find, names: [...names].sort() })
}
for (const c of spec.cases ?? spec.errors ?? []) {
	const file = path.join(dir, c.file)
	const original = ls.text(file)
	const index = original.indexOf(c.find)
	if (index < 0) throw new Error(`case marker not found: ${c.find}`)
	const edited = original.replace(c.find, c.replace)
	const faultyLine = lineOf(
		edited,
		edited.indexOf(c.line ?? c.replace, Math.max(0, index - 200)),
	)
	ls.edit(file, edited)
	const restoreExtra = applyEdits(c.alsoEdits ?? [])
	const diags = await ls.diagnostics()
	restoreExtra()
	ls.edit(file, original)
	const onLine = diags.filter((d) => d.file === c.file && d.line === faultyLine)
	const primary = onLine[0] ?? diags[0]
	result.cases.push({
		name: c.name,
		file: c.file,
		faultyLine,
		count: diags.length,
		onLine: onLine.length > 0,
		primary: primary ?? null,
		diagnostics: diags,
	})
}
await ls.close()
process.stdout.write(`${JSON.stringify(result, null, 1)}\n`)
