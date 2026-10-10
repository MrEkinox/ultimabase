import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// ADR-0297 relies on TypeScript typing a final non-generic `.with` call
// without reading its arguments. The example type-checks against the built
// packages: its usage assertions must hold and each of its typo cases must be
// reported on its own line (`@ts-expect-error`), so a regression fails here.
const exampleDirectory = path.resolve(
	import.meta.dirname,
	'../../examples/schema-form-d',
)

const readExampleConfig = (configName: string): ts.ParsedCommandLine => {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		path.join(exampleDirectory, configName),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new TypeError(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
				)
			},
		},
	)
	if (parsed === undefined) throw new TypeError('Missing example tsconfig')
	return parsed
}

const readExampleProgram = (): ts.Program => {
	const parsed = readExampleConfig('tsconfig.json')
	return ts.createProgram(parsed.fileNames, parsed.options)
}

/** Reads the QuickInfo of one exported name of `src/hovers.ts`. */
const readExampleHover = (configName: string, name: string): string => {
	const parsed = readExampleConfig(configName)
	const service = ts.createLanguageService({
		directoryExists: (directory) => ts.sys.directoryExists(directory),
		fileExists: (file) => ts.sys.fileExists(file),
		getCompilationSettings: () => parsed.options,
		getCurrentDirectory: () => exampleDirectory,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getDirectories: (directory) => ts.sys.getDirectories(directory),
		getScriptFileNames: () => parsed.fileNames,
		getScriptSnapshot: (file) => {
			const contents = ts.sys.readFile(file)
			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => '0',
		readDirectory: (...input) => ts.sys.readDirectory(...input),
		readFile: (file) => ts.sys.readFile(file),
	})
	try {
		const file = path.join(exampleDirectory, 'src/hovers.ts')
		const source = ts.sys.readFile(file) ?? ''
		const quickInfo = service.getQuickInfoAtPosition(
			file,
			source.indexOf(`const ${name}`) + 'const '.length,
		)
		return ts.displayPartsToString(quickInfo?.displayParts)
	} finally {
		service.dispose()
	}
}

const formatDiagnostic = (diagnostic: ts.Diagnostic): string => {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
	if (diagnostic.file === undefined || diagnostic.start === undefined) {
		return message
	}
	const { line } = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start,
	)
	return `${path.relative(exampleDirectory, diagnostic.file.fileName)}:${String(line + 1)} ${message}`
}

describe('schema declaration form without Typegen (ADR-0297)', () => {
	it('type-checks the example, its assertions and its typo cases from the built packages', () => {
		const program = readExampleProgram()
		const fileNames = program
			.getRootFileNames()
			.map((fileName) => path.basename(fileName))

		expect(fileNames).toEqual(expect.arrayContaining(['typos.ts', 'usage.ts']))
		expect(
			ts.getPreEmitDiagnostics(program).map(formatDiagnostic),
		).toStrictEqual([])
	}, 120_000)

	// ADR-0310: a complete result prints by name, from source and built packages.
	it.each(['tsconfig.json', 'tsconfig.source.json'])(
		'prints results and inputs by name (Model, CreateInput, UpdateInput) through %s',
		(configName) => {
			const oneTodo = readExampleHover(configName, 'oneTodo')
			expect(oneTodo).toContain('Model<"Todo"> | null')
			expect(readExampleHover(configName, 'allTodos')).toContain(
				'readonly Model<"Todo">[]',
			)
			expect(readExampleHover(configName, 'namedCreate')).toContain(
				'CreateInput<"Todo">',
			)
			expect(readExampleHover(configName, 'namedUpdate')).toContain(
				'UpdateInput<"Todo">',
			)
		},
		120_000,
	)
})
