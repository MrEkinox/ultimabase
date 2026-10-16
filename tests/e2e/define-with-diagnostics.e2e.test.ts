import { spawn } from 'node:child_process'
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createLanguageServiceWorkspace } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0339 acceptance criteria: each misuse of `define` and of
// `.with({ … })` gives one diagnostic on its own line, with a
// readable message, on TypeScript 6 (language service) and TypeScript 7
// (compiler), from sources and from built packages. The cases edit the
// `tests/register-cycle/define-with` example, which compiles cleanly.
//
// This suite shares the full E2E run with CPU-bound suites such as
// `create-app-packed`, so it does each piece of work once: one editor project
// per configuration for every case, one single-threaded TypeScript 7 build of
// every case in the background, and shared parsed files for the cycle cases.
const caseDirectory = path.resolve(
	import.meta.dirname,
	'../register-cycle/define-with',
)
const caseFiles = readdirSync(caseDirectory)
	.filter((name) => name.endsWith('.ts'))
	.sort()
const readCaseFile = (name: string): string =>
	readFileSync(path.join(caseDirectory, name), 'utf8')

const configNames = ['tsconfig.json', 'tsconfig.dist.json'] as const
type ConfigName = (typeof configNames)[number]
const variantOf = (configName: ConfigName): string =>
	configName === 'tsconfig.json' ? 'source' : 'dist'

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

const readConfig = (directory: string, configName: string) => {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		path.join(directory, configName),
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

/**
 * One TypeScript 6 editor project per configuration, edited case by case.
 * Each case is diagnosed once: a TypeScript checker is not incremental, so
 * every edit costs a full check of the case files.
 */
const createProject = (configName: ConfigName) => {
	const workspace = createLanguageServiceWorkspace({
		compilerOptions: readConfig(caseDirectory, configName).options,
		currentDirectory: caseDirectory,
	})
	let shown: ReadonlySet<string> = new Set()
	const show = (files: ReadonlyMap<string, string>): void => {
		for (const name of shown) {
			if (!files.has(name)) workspace.removeFile(path.join(caseDirectory, name))
		}
		for (const [name, source] of files) {
			workspace.addFile(path.join(caseDirectory, name), source)
		}
		shown = new Set(files.keys())
	}
	const diagnosed = new Map<string, readonly Diagnostic[]>()
	/** Diagnostics of one case; `''` is the unedited example. */
	const diagnose = (name: string): readonly Diagnostic[] => {
		const known = diagnosed.get(name)
		if (known !== undefined) return known
		const files = applyEdits(cases[name] ?? [])
		show(files)
		const diagnostics = [...files.keys()].flatMap((file) =>
			workspace.service
				.getSemanticDiagnostics(path.join(caseDirectory, file))
				.map((diagnostic) => ({
					file,
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
		diagnosed.set(name, diagnostics)
		return diagnostics
	}
	/** Completion names after `text` in one unedited file. */
	const complete = (file: string, text: string): readonly string[] => {
		show(applyEdits([]))
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
	/** The program of the unedited example, as the compiler would build it. */
	const program = (): ts.Program => {
		show(applyEdits([]))
		const current = workspace.service.getProgram()
		if (current === undefined) throw new TypeError('Missing program')
		return current
	}
	return { complete, diagnose, program }
}

const typescript7 = path.join(
	path.dirname(
		createRequire(import.meta.url).resolve('typescript-7/package.json'),
	),
	'bin',
	'tsc',
)
const scratchDirectoryOf = (configName: ConfigName, name: string): string =>
	path.join(caseDirectory, `../.define-with-${variantOf(configName)}-${name}`)
const scratchDirectories: string[] = []

const runTypeScript7 = (args: readonly string[]): Promise<string> =>
	new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [typescript7, ...args], {
			stdio: ['ignore', 'pipe', 'inherit'],
		})
		let stdout = ''
		child.stdout.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk
		})
		child.on('error', reject)
		child.on('close', () => {
			if (child.signalCode === null) resolve(stdout)
			else reject(new Error(`TypeScript 7 stopped by ${child.signalCode}`))
		})
	})

/**
 * Every case of both configurations, compiled by one TypeScript 7 build:
 * one process on one thread instead of one multi-threaded compiler per case.
 */
const compileWithTypeScript7 = async (): Promise<
	ReadonlyMap<string, readonly Diagnostic[]>
> => {
	const diagnostics = new Map<string, Diagnostic[]>()
	const projects: string[] = []
	for (const configName of configNames) {
		for (const [name, edits] of Object.entries(cases)) {
			const directory = scratchDirectoryOf(configName, name)
			scratchDirectories.push(directory)
			rmSync(directory, { force: true, recursive: true })
			cpSync(caseDirectory, directory, { recursive: true })
			for (const [file, source] of applyEdits(edits)) {
				writeFileSync(path.join(directory, file), source)
			}
			projects.push(path.join(directory, configName))
			diagnostics.set(path.basename(directory), [])
		}
	}
	const stdout = await runTypeScript7([
		'--build',
		...projects,
		'--pretty',
		'false',
		'--singleThreaded',
	])
	// Continuation lines of a message are indented; every other error line
	// must belong to a case.
	for (const line of stdout.split('\n')) {
		if (!/^\S.*\berror TS\d+:/u.test(line)) continue
		const match =
			/^(?:.*\/)?(\.define-with-[\w-]+)\/([\w.-]+\.ts)\((\d+),\d+\): error TS\d+: (.*)$/u.exec(
				line,
			)
		const reported =
			match === null ? undefined : diagnostics.get(match[1] ?? '')
		if (reported === undefined) {
			throw new TypeError(`Unexpected TypeScript 7 output: ${line}`)
		}
		reported.push({
			file: match?.[2] ?? '',
			line: Number(match?.[3]),
			message: match?.[4] ?? '',
		})
	}
	return diagnostics
}

let typescript7Diagnostics: Promise<ReadonlyMap<string, readonly Diagnostic[]>>

// TypeScript 7 compiles in its own process while TypeScript 6 checks the
// cases below; its tests come last and wait for the result.
beforeAll(() => {
	typescript7Diagnostics = compileWithTypeScript7()
	typescript7Diagnostics.catch(() => undefined)
})

afterAll(async () => {
	await typescript7Diagnostics.catch(() => undefined)
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
			from: 'rest: { findMany: true }',
			to: 'rest: { findMany: true, softDeleteOne: true }',
		},
	],
	'rule-key-typo': [
		{
			file: 'author.ts',
			from: 'rest: { findMany: true }',
			to: 'rets: { findMany: true }',
		},
	],
	'rule-given-twice': [
		{
			file: 'author.ts',
			from: 'rest: { findMany: true },',
			to: 'rest: { findMany: true },\n\trest: { count: true },',
		},
	],
	'missing-required-rule': [
		{
			file: 'post.ts',
			from: '\tacl: {\n\t\tdefault: ({ principal }) => new ACL(principal),\n\t\tlimits: { maxPrincipals: 3 },\n\t},\n',
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
		line: 26,
		message:
			"Object literal may only specify known properties, but 'softDeleteOne' does not exist in type 'RestMethodRules & Partial<Readonly<Record<never, boolean>>>'. Did you mean to write 'deleteOne'?",
	},
	'rule-key-typo': {
		file: 'author.ts',
		line: 26,
		message: '',
		pattern:
			/^Object literal may only specify known properties, and 'rets' does not exist in type 'AccessRules<SchemaRef<"Author">> & .*'\.$/u,
	},
	'rule-given-twice': {
		file: 'author.ts',
		line: 27,
		message:
			'An object literal cannot have multiple properties with the same name.',
	},
	'missing-required-rule': {
		file: 'post.ts',
		line: 18,
		message: '',
		pattern:
			/^Argument of type '\{ access: .*' is not assignable to parameter of type 'AccessRules<SchemaRef<"Post">> & .*'\.$/u,
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
	message: "Type 'unknown' is not assignable to type 'string | undefined'.",
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

const projects = new Map(
	configNames.map((configName) => [configName, createProject(configName)]),
)
const projectOf = (configName: ConfigName) => {
	const project = projects.get(configName)
	if (project === undefined) throw new TypeError(`Missing ${configName}`)
	return project
}

describe.each(configNames)(
	'define and .with diagnostics through %s (ADR-0339)',
	(configName) => {
		const { complete, diagnose } = projectOf(configName)

		it('compiles the example without diagnostics', () => {
			expect(diagnose('')).toStrictEqual([])
		}, 120_000)

		it.each(Object.keys(cases))(
			'reports %s once, on its line, on TypeScript 6',
			(name) => {
				expectCase(name, diagnose(name))
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
			const [missingRule] = diagnose('missing-required-rule')
			const [missingWith] = diagnose('missing-with')

			expect(missingRule?.message.split('\n').at(-1)).toMatch(
				/^ {2}Property 'acl' is missing in type '.*' but required in type 'ACLRules<SchemaRef<"Post">>'\.$/u,
			)
			expect(missingWith?.message).toContain(
				'Draft needs .with({ acl: … }): a feature set in its define() requires that rule',
			)
		}, 120_000)
	},
)

// The cycle cases of the new form (form 1 example, mutual relation filters,
// plugin contributions, User and Role factories) compile on TypeScript 6
// too; the TypeScript 7 job compiles every `tests/register-cycle` case.
describe.each(configNames)(
	'define and .with Register cycle cases through %s on TypeScript 6',
	(configName) => {
		// The cases parse the same package files: parse them once.
		const sourceFiles = new Map<string, ts.SourceFile | undefined>()
		const createProgram = (directory: string): ts.Program => {
			const { fileNames, options } = readConfig(directory, configName)
			const host = ts.createCompilerHost(options)
			const getSourceFile = host.getSourceFile.bind(host)
			host.getSourceFile = (fileName, languageVersion, ...rest) => {
				const key = JSON.stringify(
					typeof languageVersion === 'object'
						? [
								fileName,
								languageVersion.languageVersion,
								languageVersion.impliedNodeFormat,
							]
						: [fileName, languageVersion],
				)
				if (sourceFiles.has(key)) return sourceFiles.get(key)
				const sourceFile = getSourceFile(fileName, languageVersion, ...rest)
				sourceFiles.set(key, sourceFile)
				return sourceFile
			}
			return ts.createProgram(fileNames, options, host)
		}

		it.each([
			'define-with',
			'define-with-contribution',
			'define-with-mutual',
			'define-with-role',
			'define-with-user',
		])(
			'compiles %s without diagnostics',
			(name) => {
				// The editor project above already holds the `define-with` program.
				const program =
					name === 'define-with'
						? projectOf(configName).program()
						: createProgram(path.resolve(caseDirectory, '..', name))

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

describe.each(configNames)(
	'define and .with diagnostics through %s on TypeScript 7 (ADR-0339)',
	(configName) => {
		it.each(Object.keys(cases))(
			'reports %s once, on its line, on TypeScript 7',
			async (name) => {
				const diagnostics = await typescript7Diagnostics

				expectCase(
					name,
					diagnostics.get(
						path.basename(scratchDirectoryOf(configName, name)),
					) ?? [],
				)
			},
			120_000,
		)
	},
)
