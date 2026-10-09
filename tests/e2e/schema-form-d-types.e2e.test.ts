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

const readExampleProgram = (): ts.Program => {
	const configFile = path.join(exampleDirectory, 'tsconfig.json')
	const { config, error } = ts.readConfigFile(configFile, ts.sys.readFile)
	if (error !== undefined) {
		throw new TypeError(
			ts.flattenDiagnosticMessageText(error.messageText, '\n'),
		)
	}
	const parsed = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		exampleDirectory,
		undefined,
		configFile,
	)
	return ts.createProgram(parsed.fileNames, parsed.options)
}

const formatDiagnostic = (diagnostic: ts.Diagnostic): string => {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
	if (diagnostic.file === undefined || diagnostic.start === undefined) {
		return message
	}
	const { line } = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start,
	)
	return `${path.relative(exampleDirectory, diagnostic.file.fileName)}:${line + 1} ${message}`
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
})
