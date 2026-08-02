import { packAsList } from '@publint/pack'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface PackageFixture {
	directory: string
	name: `@ultimabase/${string}`
}

interface DeclarationQuickInfo {
	readonly display: string
	readonly documentation: string
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const packagesDirectory = path.join(repositoryRoot, 'packages')
const packageEntries = await readdir(packagesDirectory, { withFileTypes: true })
const packageFixtures: PackageFixture[] = packageEntries
	.filter((entry): boolean => entry.isDirectory())
	.map((entry): PackageFixture => ({
		directory: path.join(packagesDirectory, entry.name),
		name: `@ultimabase/${entry.name}`,
	}))
	.sort((left, right): number => left.name.localeCompare(right.name))
const rootLicense = await readFile(path.join(repositoryRoot, 'LICENSE'), 'utf8')
const consumerRequire = createRequire(import.meta.url)
const schemaFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/runtime-postgres.postgres.e2e.test.ts',
)
const schemaFixtureSource = await readFile(schemaFixtureFile, 'utf8')
const schemaLanguageServiceHost: ts.LanguageServiceHost = {
	fileExists: (fileName) => ts.sys.fileExists(fileName),
	getCompilationSettings: () => ({
		exactOptionalPropertyTypes: true,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		target: ts.ScriptTarget.ESNext,
	}),
	getCurrentDirectory: () => repositoryRoot,
	getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
	getScriptFileNames: () => [schemaFixtureFile],
	getScriptSnapshot: (fileName) => {
		const contents =
			fileName === schemaFixtureFile
				? schemaFixtureSource
				: ts.sys.readFile(fileName)

		return contents === undefined
			? undefined
			: ts.ScriptSnapshot.fromString(contents)
	},
	getScriptVersion: () => '0',
	readFile: (fileName) => ts.sys.readFile(fileName),
}
const schemaLanguageService = ts.createLanguageService(
	schemaLanguageServiceHost,
)

const getResolutionError = (specifier: string): unknown => {
	try {
		consumerRequire.resolve(specifier)
	} catch (error: unknown) {
		return error
	}

	throw new Error(`Private package path unexpectedly resolved: ${specifier}`)
}

/** Reads editor QuickInfo through the same compiled package exports consumers use. */
const readFixtureQuickInfo = (propertySource: string): DeclarationQuickInfo => {
	const position = schemaFixtureSource.indexOf(propertySource)

	if (position < 0) {
		throw new TypeError(`Missing schema hover fixture: ${propertySource}`)
	}

	const quickInfo = schemaLanguageService.getQuickInfoAtPosition(
		schemaFixtureFile,
		position,
	)

	return {
		display: quickInfo?.displayParts?.map(({ text }) => text).join('') ?? '',
		documentation:
			quickInfo?.documentation?.map(({ text }) => text).join('') ?? '',
	}
}

describe.each(packageFixtures)('$name archive', ({ directory, name }) => {
	it('contains only public distribution files', async () => {
		// publint's pack helper asks Yarn for the exact publish file list.
		const files = (
			await packAsList(directory, { packageManager: 'yarn' })
		).sort()
		const requiredFiles = ['README.md', 'dist/LICENSE', 'package.json']
		// CHANGELOG.md becomes present after the package receives its first version.
		const unexpectedFiles = files.filter(
			(file): boolean =>
				file !== 'CHANGELOG.md' &&
				file !== 'README.md' &&
				file !== 'package.json' &&
				!file.startsWith('dist/'),
		)

		expect(files).toEqual(expect.arrayContaining(requiredFiles))
		expect(unexpectedFiles).toStrictEqual([])
		expect(
			await readFile(path.join(directory, 'dist', 'LICENSE'), 'utf8'),
		).toBe(rootLicense)
	})

	it('exposes its root while keeping source paths private', async () => {
		// The repository test suite is an external consumer of workspace export maps.
		await expect(import(name)).resolves.toBeTypeOf('object')
		expect(getResolutionError(`${name}/src/index.js`)).toMatchObject({
			code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
		})
	})
})

describe('@ultimabase/schema declaration artifact', () => {
	it('exposes the documented Schema constructor', () => {
		const schema = readFixtureQuickInfo('Schema({')

		// The packed declaration must retain the class-level help shown by editors.
		expect(schema.display).toContain('new Schema<')
		expect(schema.documentation).toContain('Declares an immutable schema')
	})

	it('preserves field option documentation through package exports', () => {
		const validation = readFixtureQuickInfo('validation: { required: true }')

		// Compiled declarations expose only the booleans needed by field inference.
		expect(validation.display).toContain('StringValidationOptions & {')
		expect(validation.display).toContain('readonly required?: true')
		expect(validation.display).toContain('readonly nullable?: false')
		expect(validation.display).not.toContain(
			'FieldValidationOptions & StringValidationOptions',
		)
		expect(validation.documentation).toContain('Groups presence rules')
		expect(readFixtureQuickInfo('required: true }').documentation).toContain(
			'Requires the field',
		)
	})

	it('materializes create result properties in editor hovers', () => {
		const created = readFixtureQuickInfo('created = await request')
		const create = readFixtureQuickInfo('create(allFieldValues)')

		// This guards the declaration experience seen through Query and Runtime exports.
		expect(created.display).toContain('readonly externalId?: string;')
		expect(created.display).toContain('readonly id: string;')
		expect(created.display).toContain('readonly metadata?: JsonDocument;')
		expect(created.display).not.toContain('Simplify<')
		expect(created.display).not.toContain('ObjectRequiredFields<')
		expect(created.display).not.toContain('ObjectOptionalFields<')
		// Every bound query is executable, so no terminal exposes a capability guard.
		expect(create.display).toContain('create(input: {')
		expect(create.display).not.toContain('create(this:')
	})

	it('keeps bound builder and terminal hovers focused', () => {
		const select = readFixtureQuickInfo("select('id', 'title')")
		const find = readFixtureQuickInfo('find()')
		const deleteOne = readFixtureQuickInfo('deleteOne()')
		const count = readFixtureQuickInfo('count()')
		const exists = readFixtureQuickInfo('exists()')

		// Selection inference needs only the accumulated field union, not a tuple copy.
		expect(select.display).toContain('select<"id" | "title">')
		expect(select.display).not.toContain('readonly ["id", "title"]')
		// Parameterless terminals must not repeat the complete bound query as `this`.
		expect(find.display).toContain('.find(): Promise<')
		expect(deleteOne.display).toContain('.deleteOne(): Promise<')
		expect(count.display).toContain('.count(): Promise<number>')
		expect(exists.display).toContain('.exists(): Promise<boolean>')
		for (const terminal of [find, deleteOne, count, exists]) {
			expect(terminal.display).not.toContain('(this:')
		}
	})

	it('materializes only selected fields in editor hovers', () => {
		const found = readFixtureQuickInfo('found = await request')

		// Selected terminals must not expose the complete schema behind a Pick alias.
		expect(found.display).toContain('readonly id: string;')
		expect(found.display).toContain('readonly title: string;')
		expect(found.display).not.toContain('readonly published: boolean;')
		expect(found.display).not.toContain('readonly views: number;')
		expect(found.display).not.toContain('Pick<')
	})

	it('materializes update operator groups in editor hovers', () => {
		const update = readFixtureQuickInfo('updateOne({')
		const inputDisplay = update.display.slice(
			update.display.indexOf('.updateOne(input:'),
		)

		// Developers should see usable operators instead of the complete field schema.
		expect(inputDisplay).toContain('readonly set: {')
		expect(inputDisplay).toContain('readonly views?: number;')
		expect(inputDisplay).toContain('readonly unset?: readonly (')
		expect(inputDisplay).toContain('readonly increment?: {')
		expect(inputDisplay).not.toContain('UpdateExpressionInput<')
		expect(inputDisplay).not.toContain('SchemaDefinition<')
		expect(inputDisplay).not.toContain('NonDefaultedIntField<')
	})
})
