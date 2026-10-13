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

// One language service per configuration serves every hover of a test: each
// new service would type-check the whole example again.
const createExampleService = (configName: string): ts.LanguageService => {
	const parsed = readExampleConfig(configName)
	return ts.createLanguageService({
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
}

/** Reads the QuickInfo of one exported name of `src/hovers.ts`. */
const readExampleHover = (
	service: ts.LanguageService,
	name: string,
): string => {
	const file = path.join(exampleDirectory, 'src/hovers.ts')
	const source = ts.sys.readFile(file) ?? ''
	const quickInfo = service.getQuickInfoAtPosition(
		file,
		source.indexOf(`const ${name}`) + 'const '.length,
	)
	return ts.displayPartsToString(quickInfo?.displayParts)
}

/** Reads the QuickInfo of `src/hovers.ts` at the end of one marker. */
const readMarkerHover = (
	service: ts.LanguageService,
	marker: string,
): string => {
	const file = path.join(exampleDirectory, 'src/hovers.ts')
	const source = ts.sys.readFile(file) ?? ''
	const quickInfo = service.getQuickInfoAtPosition(
		file,
		source.indexOf(marker) + marker.length - 1,
	)
	return ts.displayPartsToString(quickInfo?.displayParts)
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

const expectedErrors = new Map<string, readonly string[]>()

/**
 * Reads the diagnostics of one example file with its `@ts-expect-error`
 * directives removed, so the expected errors become visible. Each file and
 * configuration is checked once; several tests read the same result.
 */
const readExpectedErrors = (
	configName: string,
	fileName: string,
): readonly string[] => {
	const key = `${configName}:${fileName}`
	const cached = expectedErrors.get(key)
	if (cached !== undefined) return cached
	const errors = checkExpectedErrors(configName, fileName)
	expectedErrors.set(key, errors)
	return errors
}

const checkExpectedErrors = (
	configName: string,
	fileName: string,
): readonly string[] => {
	const parsed = readExampleConfig(configName)
	const file = path.join(exampleDirectory, fileName)
	const source = (ts.sys.readFile(file) ?? '').replaceAll(
		/\/\/ @ts-expect-error[^\n]*/gu,
		'//',
	)
	const host = ts.createCompilerHost(parsed.options)
	const readSourceFile = host.getSourceFile.bind(host)
	host.getSourceFile = (name, languageVersion, ...rest) =>
		path.resolve(name) === file
			? ts.createSourceFile(name, source, languageVersion)
			: readSourceFile(name, languageVersion, ...rest)
	const program = ts.createProgram(parsed.fileNames, parsed.options, host)
	return program
		.getSemanticDiagnostics(program.getSourceFile(file))
		.map(formatDiagnostic)
}

describe('schema declaration form (ADR-0297)', () => {
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
			const service = createExampleService(configName)
			try {
				const oneTodo = readExampleHover(service, 'oneTodo')
				expect(oneTodo).toContain('Model<"Todo"> | null')
				expect(readExampleHover(service, 'allTodos')).toContain(
					'readonly Model<"Todo">[]',
				)
				expect(readExampleHover(service, 'namedCreate')).toContain(
					'CreateInput<"Todo">',
				)
				expect(readExampleHover(service, 'namedUpdate')).toContain(
					'UpdateInput<"Todo">',
				)
			} finally {
				service.dispose()
			}
		},
		120_000,
	)

	// ADR-0332: a unique target prints by name, and wrong targets and order
	// keys are reported on their line, from source and built packages.
	it.each(['tsconfig.json', 'tsconfig.source.json'])(
		'types unique targets and order keys through %s',
		(configName) => {
			const service = createExampleService(configName)
			try {
				expect(readMarkerHover(service, '/* hover:unique-where */ where')).toBe(
					'(property) where: UniqueWhereInput<"TodoRole">',
				)
				expect(readExampleHover(service, 'namedTarget')).toBe(
					'const namedTarget: UniqueWhereInput<"TodoRole">',
				)
			} finally {
				service.dispose()
			}
			const target = `'{ readonly id: string | { readonly eq: string; }; }'`
			expect(readExpectedErrors(configName, 'src/typos.ts')).toEqual(
				expect.arrayContaining([
					`src/typos.ts:138 Object literal may only specify known properties, and 'title' does not exist in type ${target}.`,
					`src/typos.ts:144 Object literal may only specify known properties, and 'archived' does not exist in type ${target}.`,
					"src/typos.ts:150 Type 'null' is not assignable to type 'string | { readonly eq: string; }'.",
					expect.stringContaining(
						'src/typos.ts:155 Object literal may only specify known properties, and \'acl\' does not exist in type \'Readonly<{ readonly title?: "asc" | "desc" | null;',
					),
				]),
			)
		},
		120_000,
	)

	// ADR-0315 (step 5b amendment): a misspelled `select` or `include` field is
	// reported by name against the schema's contract, not as "No overload
	// matches this call", from source and built packages.
	it.each(['tsconfig.json', 'tsconfig.source.json'])(
		'reports select and include typos by field name through %s',
		(configName) => {
			const typos = readExpectedErrors(configName, 'src/typos.ts')
			const exactness = readExpectedErrors(configName, 'src/exactness.ts')
			// The printed key order follows TypeScript's type creation order: the
			// User from `App.UserSchema` (ADR-0326) changes it in this file.
			const selectTypo =
				"Object literal may only specify known properties, but 'titel' does not exist in type 'Readonly<{ id?: true; acl?: boolean; assignee?: boolean; createdAt?: boolean; updatedAt?: boolean; title?: boolean; archived?: boolean; priority?: boolean; parent?: boolean; isDeleted?: boolean; deletedAt?: boolean; }>'. Did you mean to write 'title'?"

			// Same members as `selectTypo`; the deferred Register read (ADR-0297,
			// 2026-10-12 note) changes the order TypeScript prints them in here.
			const typosSelectTypo =
				"Object literal may only specify known properties, but 'titel' does not exist in type 'Readonly<{ id?: true; acl?: boolean; createdAt?: boolean; updatedAt?: boolean; archived?: boolean; assignee?: boolean; title?: boolean; priority?: boolean; parent?: boolean; isDeleted?: boolean; deletedAt?: boolean; }>'. Did you mean to write 'title'?"

			expect(typos).toContain(`src/typos.ts:76 ${typosSelectTypo}`)
			expect(exactness).toContain(`src/exactness.ts:27 ${selectTypo}`)
			expect(exactness).toContain(
				"src/exactness.ts:29 Object literal may only specify known properties, but 'labl' does not exist in type 'Readonly<{ id?: true; createdAt?: boolean; updatedAt?: boolean; label?: boolean; }>'. Did you mean to write 'label'?",
			)
			expect(
				[...typos, ...exactness].filter((diagnostic) =>
					diagnostic.includes('No overload matches this call'),
				),
			).toStrictEqual([])
		},
		120_000,
	)

	// ADR-0328: relation filters in `.with({ relations })` are typed against
	// the complete target (Tag and Todo filter each other), and each misuse is
	// reported on its own line, from source and built packages.
	it.each(['tsconfig.json', 'tsconfig.source.json'])(
		'reports relation filter misuses on their line through %s',
		(configName) => {
			const typos = readExpectedErrors(configName, 'src/typos.ts')
			const rules = `'{ readonly todos?: RelationRule<SchemaRef<"Todo">>; }'`

			expect(typos).toEqual(
				expect.arrayContaining([
					`src/typos.ts:90 Object literal may only specify known properties, but 'todoz' does not exist in type ${rules}. Did you mean to write 'todos'?`,
					`src/typos.ts:104 Object literal may only specify known properties, and 'label' does not exist in type ${rules}.`,
					`src/typos.ts:118 Object literal may only specify known properties, and 'archivd' does not exist in type 'RelationWhere<SchemaRef<"Todo">>'.`,
					`src/typos.ts:120 Argument of type '"titel"' is not assignable to parameter of type 'WhereBuilderTarget<SchemaRef<"Todo">, "ne">'.`,
				]),
			)
			expect(
				typos.filter((diagnostic) =>
					diagnostic.startsWith('src/typos.ts:130 '),
				),
			).toEqual([
				expect.stringContaining(
					"Object literal may only specify known properties, and 'relations' does not exist in type",
				),
			])
		},
		120_000,
	)
})
