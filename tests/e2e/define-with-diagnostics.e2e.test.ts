import { spawnSync } from 'node:child_process'
import {
	cpSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import { createLanguageServiceWorkspace } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0339 acceptance criteria: each misuse of `define` and of
// `.with((plugins) => …)` gives one diagnostic on its own line, with a
// readable message, on TypeScript 6 (language service) and TypeScript 7
// (compiler), from sources and from built packages. The cases edit the
// `tests/register-cycle/define-with` example, which compiles cleanly.
const caseDirectory = path.resolve(
	import.meta.dirname,
	'../register-cycle/define-with',
)
const caseFiles = readdirSync(caseDirectory)
	.filter((name) => name.endsWith('.ts'))
	.sort()
const readCaseFile = (name: string): string =>
	readFileSync(path.join(caseDirectory, name), 'utf8')

interface Edit {
	readonly file: string
	/** Text to replace; `undefined` adds the file. */
	readonly from?: string
	readonly to: string
}

interface Diagnostic {
	readonly file: string
	readonly line: number
	readonly message: string
}

const applyEdits = (edits: readonly Edit[]): ReadonlyMap<string, string> => {
	const files = new Map(caseFiles.map((name) => [name, readCaseFile(name)]))
	for (const { file, from, to } of edits) {
		if (from === undefined) {
			files.set(file, to)
			continue
		}
		const source = files.get(file) ?? ''
		if (!source.includes(from)) {
			throw new TypeError(`${file} does not contain ${from}`)
		}
		files.set(file, source.replace(from, to))
	}
	return files
}

const readConfig = (configName: string): ts.ParsedCommandLine => {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		path.join(caseDirectory, configName),
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
	if (parsed === undefined) throw new TypeError(`Missing ${configName}`)
	return parsed
}

/** One TypeScript 6 editor project per configuration, edited case by case. */
const createProject = (configName: string) => {
	const workspace = createLanguageServiceWorkspace({
		compilerOptions: readConfig(configName).options,
		currentDirectory: caseDirectory,
	})
	const diagnose = (edits: readonly Edit[]): readonly Diagnostic[] => {
		const files = applyEdits(edits)
		for (const name of new Set([...caseFiles, ...files.keys()])) {
			workspace.addFile(path.join(caseDirectory, name), files.get(name) ?? '')
		}
		return [...files.keys()].flatMap((name) =>
			workspace.service
				.getSemanticDiagnostics(path.join(caseDirectory, name))
				.map((diagnostic) => ({
					file: name,
					line:
						diagnostic.file === undefined || diagnostic.start === undefined
							? 0
							: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
									.line + 1,
					message: ts.flattenDiagnosticMessageText(
						diagnostic.messageText,
						'\n',
					),
				})),
		)
	}
	/** Completion names after `text` in one unedited file. */
	const complete = (file: string, text: string): readonly string[] => {
		diagnose([])
		const source = readCaseFile(file)
		return (
			workspace.service
				.getCompletionsAtPosition(
					path.join(caseDirectory, file),
					source.indexOf(text) + text.length,
					{},
				)
				?.entries.map(({ name }) => name) ?? []
		)
	}
	return { complete, diagnose }
}

const typescript7 = path.join(
	path.dirname(
		createRequire(import.meta.url).resolve('typescript-7/package.json'),
	),
	'bin',
	'tsc',
)
const scratchDirectories: string[] = []

/** The same case compiled by the TypeScript 7 compiler. */
const compileWithTypeScript7 = (
	name: string,
	configName: string,
	edits: readonly Edit[],
): readonly Diagnostic[] => {
	const directory = path.join(caseDirectory, `../.define-with-${name}`)
	scratchDirectories.push(directory)
	rmSync(directory, { force: true, recursive: true })
	cpSync(caseDirectory, directory, { recursive: true })
	for (const [file, source] of applyEdits(edits)) {
		writeFileSync(path.join(directory, file), source)
	}
	const result = spawnSync(
		process.execPath,
		[typescript7, '-p', path.join(directory, configName), '--pretty', 'false'],
		{ encoding: 'utf8' },
	)
	rmSync(directory, { force: true, recursive: true })
	return result.stdout.split('\n').flatMap((line) => {
		const match =
			/^(?:.*\/)?([\w.-]+\.ts)\((\d+),\d+\): error TS\d+: (.*)$/u.exec(line)
		return match === null
			? []
			: [
					{
						file: match[1] ?? '',
						line: Number(match[2]),
						message: match[3] ?? '',
					},
				]
	})
}

afterAll(() => {
	for (const directory of scratchDirectories) {
		rmSync(directory, { force: true, recursive: true })
	}
})

const cases: Readonly<Record<string, readonly Edit[]>> = {
	'define-key-typo': [
		{
			file: 'post.ts',
			from: '\tsoftDelete: { mode',
			to: '\tsofDelete: { mode',
		},
	],
	'feature-option-typo': [
		{ file: 'post.ts', from: "{ mode: 'command' }", to: "{ mod: 'command' }" },
	],
	'index-field-typo': [
		{
			file: 'post.ts',
			from: "{ fields: ['slug'], unique: true, where",
			to: "{ fields: ['slugg'], unique: true, where",
		},
	],
	'index-where-typo': [
		{
			file: 'post.ts',
			from: 'where: { isDeleted: false }',
			to: 'where: { isDeletd: false }',
		},
	],
	'command-without-feature': [
		{
			file: 'author.ts',
			from: '.rest({ findMany: true })',
			to: '.rest({ findMany: true, softDeleteOne: true })',
		},
	],
	'builder-method-twice': [
		{
			file: 'author.ts',
			from: '.rest({ findMany: true })',
			to: '.rest({ findMany: true }).rest({ count: true })',
		},
	],
	'missing-required-rule': [
		{
			file: 'post.ts',
			from: '\t\t.acl({\n\t\t\tdefault: ({ principal }) => new ACL(principal),\n\t\t\tlimits: { maxPrincipals: 3 },\n\t\t})\n',
			to: '',
		},
		{
			file: 'post.ts',
			from: "import { ACL } from '@ultimabase/acl-permissions-plugin'\n",
			to: '',
		},
	],
	'missing-with': [
		{
			file: 'draft.ts',
			to: "import { App } from './app.ts'\n\nexport const Draft = App.Schema.define({\n\tclassName: 'Draft',\n\tfields: (field) => ({ title: field.string() }),\n\tacl: true,\n})\n",
		},
		{
			file: 'ultimabase.ts',
			from: "import { Post } from './post.ts'\n",
			to: "import { Draft } from './draft.ts'\nimport { Post } from './post.ts'\n",
		},
		{
			file: 'ultimabase.ts',
			from: 'schemas: [Author, Post]',
			to: 'schemas: [Author, Post, Draft]',
		},
	],
}

// The first line of each expected diagnostic. Union members print in
// creation order, which differs between TypeScript 6 and 7.
const expected: Readonly<
	Record<string, Diagnostic & { readonly pattern?: RegExp }>
> = {
	'define-key-typo': {
		file: 'post.ts',
		line: 13,
		message: '',
		pattern:
			/^Type '\{ mode: string; \}' is not assignable to type '"sofDelete is not a key of define\(\): use className, fields, indexes, (softDelete, acl|acl, softDelete)"'\.$/u,
	},
	'feature-option-typo': {
		file: 'post.ts',
		line: 13,
		message:
			"Object literal may only specify known properties, but 'mod' does not exist in type 'SoftDeleteOptions'. Did you mean to write 'mode'?",
	},
	'index-field-typo': {
		file: 'post.ts',
		line: 17,
		message: '',
		pattern:
			/^Type '"slugg"' is not assignable to type 'SchemaFieldName<.*'\. Did you mean '"slug"'\?$/u,
	},
	'index-where-typo': {
		file: 'post.ts',
		line: 17,
		message: '',
		pattern:
			/^Object literal may only specify known properties, but 'isDeletd' does not exist in type '.*'\. Did you mean to write 'isDeleted'\?$/u,
	},
	'command-without-feature': {
		file: 'author.ts',
		line: 27,
		message:
			"Object literal may only specify known properties, but 'softDeleteOne' does not exist in type 'RestMethodRules & Partial<Readonly<Record<never, boolean>>>'. Did you mean to write 'deleteOne'?",
	},
	'builder-method-twice': {
		file: 'author.ts',
		line: 27,
		message: '',
		pattern:
			/^Property 'rest' does not exist on type 'SchemaRulesBuilder<never, AccessRules<SchemaRef<"Author">> & .*'\.$/u,
	},
	'missing-required-rule': {
		file: 'post.ts',
		line: 19,
		message: '',
		pattern:
			/^Type 'SchemaRulesBuilder<"acl", AccessRules<SchemaRef<"Post">> & .*' is not assignable to type 'CompleteSchemaRules'\.$/u,
	},
	'missing-with': {
		file: 'ultimabase.ts',
		line: 6,
		message: '',
		pattern: /^Type 'DeclaredSchema<.*SchemaRegistrationError<\.\.\.>'/u,
	},
}

// A failed `define` call is typed again by TypeScript without its `fields`
// callback (context-sensitive arguments are skipped for an overload failure),
// so a file reading the schema's fields sees `unknown`. `main` behaves the
// same for a typo in `define`; the declaration itself reports one error.
const failedDefineCascade: Diagnostic = {
	file: 'usage.ts',
	line: 15,
	message: "Type 'unknown' is not assignable to type 'string'.",
}
const failedDefineCases = new Set([
	'define-key-typo',
	'feature-option-typo',
	'index-field-typo',
	'index-where-typo',
])

const firstLine = ({ file, line, message }: Diagnostic): Diagnostic => ({
	file,
	line,
	message: message.split('\n')[0] ?? '',
})

const expectCase = (name: string, diagnostics: readonly Diagnostic[]): void => {
	const { pattern, ...diagnostic } = expected[name] ?? {
		file: '',
		line: 0,
		message: '',
	}
	const reported = diagnostics.map(firstLine)
	const cascade = failedDefineCases.has(name) ? [failedDefineCascade] : []
	expect(reported).toHaveLength(1 + cascade.length)
	expect(reported.slice(1)).toStrictEqual(cascade)
	const [first] = reported
	expect({ file: first?.file, line: first?.line }).toStrictEqual({
		file: diagnostic.file,
		line: diagnostic.line,
	})
	if (pattern === undefined) expect(first?.message).toBe(diagnostic.message)
	else expect(first?.message).toMatch(pattern)
}

describe.each(['tsconfig.json', 'tsconfig.dist.json'])(
	'define and .with diagnostics through %s (ADR-0339)',
	(configName) => {
		const { complete, diagnose } = createProject(configName)

		it('compiles the example without diagnostics', () => {
			expect(diagnose([])).toStrictEqual([])
		}, 120_000)

		it.each(Object.keys(cases))(
			'reports %s once, on its line, on TypeScript 6 and 7',
			(name) => {
				const edits = cases[name] ?? []
				expectCase(name, diagnose(edits))
				expectCase(name, compileWithTypeScript7(name, configName, edits))
			},
			120_000,
		)

		it('completes no configuration member on a finished schema', () => {
			const members = complete('usage.ts', 'await Post.')

			expect(members).toEqual(
				expect.arrayContaining(['findMany', 'softDeleteOne', 'updateOne']),
			)
			for (const member of ['with', 'softDelete', 'acl', 'relations']) {
				expect(members).not.toContain(member)
			}
		}, 120_000)

		it('reports the missing rule by name on TypeScript 6', () => {
			const [missingRule] = diagnose(cases['missing-required-rule'] ?? [])
			const [missingWith] = diagnose(cases['missing-with'] ?? [])

			expect(missingRule?.message.split('\n').at(-1)).toBe(
				`    Type '"plugins.acl({ … }) is required by a feature set in define()"' is not assignable to type 'never'.`,
			)
			expect(missingWith?.message).toContain(
				'Draft needs .with((plugins) => plugins.acl({ … })): a feature set in its define() requires that rule',
			)
		}, 120_000)
	},
)

// The cycle cases of the new form (form 1 example, mutual relation filters,
// plugin contributions, User and Role factories) compile on TypeScript 6
// too; the TypeScript 7 job compiles every `tests/register-cycle` case.
describe.each(['tsconfig.json', 'tsconfig.dist.json'])(
	'define and .with Register cycle cases through %s on TypeScript 6',
	(configName) => {
		it.each([
			'define-with',
			'define-with-contribution',
			'define-with-mutual',
			'define-with-role',
			'define-with-user',
		])(
			'compiles %s without diagnostics',
			(name) => {
				const directory = path.resolve(caseDirectory, '..', name)
				const parsed = ts.getParsedCommandLineOfConfigFile(
					path.join(directory, configName),
					{},
					{
						...ts.sys,
						onUnRecoverableConfigFileDiagnostic: () => undefined,
					},
				)
				if (parsed === undefined) throw new TypeError(`Missing ${name}`)
				const program = ts.createProgram(parsed.fileNames, parsed.options)

				expect(
					ts
						.getPreEmitDiagnostics(program)
						.map(({ messageText }) =>
							ts.flattenDiagnosticMessageText(messageText, '\n'),
						),
				).toStrictEqual([])
			},
			120_000,
		)
	},
)
