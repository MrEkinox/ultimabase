import { packAsList } from '@publint/pack'
import { existsSync } from 'node:fs'
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
	.filter(
		(entry): boolean =>
			entry.isDirectory() &&
			existsSync(path.join(packagesDirectory, entry.name, 'package.json')),
	)
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

describe('@ultimabase/core Schema and Query declarations', () => {
	it('exposes the documented Schema definition factory', () => {
		const schema = readFixtureQuickInfo('define({')

		// The packed declaration must retain the class-level help shown by editors.
		expect(schema.display).toContain('Schema.define<')
		expect(schema.documentation).toContain(
			'Defines one final schema-specific class',
		)
	})

	it('preserves constructible drafts and static Query access', () => {
		const draft = readFixtureQuickInfo('packedDraft = new PostSchema')
		const query = readFixtureQuickInfo('packedQuery = PostSchema.query()')

		expect(draft.display).toContain('readonly title: string;')
		expect(draft.display).not.toContain('readonly id: string;')
		expect(query.display).toContain('Query<')
		expect(query.display).toContain('QuerySelectionKeyWithValue<')
	})

	it('preserves compact immutable model persistence commands', () => {
		const create = readFixtureQuickInfo('create({ useMasterKey: true })')
		const update = readFixtureQuickInfo("update({ title: 'Packed update' })")

		expect(create.display).toContain(
			'create(options?: QueryTerminalOptions): Promise<PersistedSchemaModel<',
		)
		expect(create.documentation).toContain('same Query and Runtime pipeline')
		expect(update.display).toContain('update(input:')
		expect(update.display).toContain('Promise<PersistedSchemaModel<')
		expect(update.documentation).toContain('protected object identity')
		expect(create.display).not.toContain('NonDefaultedStringField<')
		expect(update.display).not.toContain('NonDefaultedStringField<')
	})

	it('preserves the discriminated non-atomic bulk result', () => {
		const bulk = readFixtureQuickInfo('packedNonAtomicCreate = () =>')

		expect(bulk.display).toContain('NonAtomicBulkResult<')
		expect(bulk.display).not.toContain('readonly SchemaResult<')
	})

	it('preserves field option documentation through package exports', () => {
		const validation = readFixtureQuickInfo('validation: { required: true }')

		// Compiled declarations expose required presence without a nullable switch.
		expect(validation.display).toContain('StringValidationOptions & {')
		expect(validation.display).toContain('readonly required?: true')
		expect(validation.display).not.toContain('readonly nullable?:')
		expect(validation.display).not.toContain(
			'FieldValidationOptions & StringValidationOptions',
		)
		expect(validation.documentation).toContain('Groups presence rules')
		expect(readFixtureQuickInfo('required: true }').documentation).toContain(
			'Requires the field',
		)
	})

	it('materializes mutation result properties in editor hovers', () => {
		const created = readFixtureQuickInfo('created = await PostSchema')
		const selected = readFixtureQuickInfo('selectedCreate = await PostSchema')
		const deleted = readFixtureQuickInfo('deleted = await PostSchema')
		const bulkUpdated = readFixtureQuickInfo(
			'bulkUpdated = await BulkAccountSchema',
		)
		const create = readFixtureQuickInfo(
			'create(\n\t\t\t\t{ data: allFieldValues },',
		)

		// This guards the declaration experience seen through Query and Runtime exports.
		expect(created.display).toContain('readonly externalId: string | null;')
		expect(created.display).toContain('readonly metadata: JsonDocument | null;')
		expect(created.display).not.toContain('Simplify<')
		expect(created.display).not.toContain('ObjectRequiredFields<')
		expect(created.display).not.toContain('ObjectOptionalFields<')
		expect(selected.display).toContain('readonly id: string;')
		expect(selected.display).toContain('readonly title: string;')
		expect(selected.display).not.toContain('readonly metadata:')
		expect(deleted.display).toContain('readonly id: string;')
		expect(deleted.display).toContain('readonly title: string;')
		expect(deleted.display).not.toContain('readonly metadata:')
		expect(bulkUpdated.display).toContain('readonly id: string;')
		expect(bulkUpdated.display).not.toContain('readonly tenantId:')
		// Contextual execution stays in the optional final argument.
		expect(create.display).toContain('.create(input: SchemaCreateOneInput<')
		expect(create.display).toContain('options?: QueryTerminalOptions')
		expect(create.display).not.toContain('create(this:')
	})

	it('keeps immutable read builders and schema command hovers focused', () => {
		const select = readFixtureQuickInfo('select({ id: true, title: true })')
		const find = readFixtureQuickInfo('find({ ultimabase })')
		const deletion = readFixtureQuickInfo('deleteOne(')
		const count = readFixtureQuickInfo('count({ ultimabase })')
		const exists = readFixtureQuickInfo('exists({ ultimabase })')

		// Selection inference retains the literal object needed by true/false projection.
		expect(select.display).toContain('select<{')
		expect(select.display).toContain('id: true')
		expect(select.display).toContain('title: true')
		// Parameterless terminals must not repeat the complete bound query as `this`.
		expect(find.display).toContain(
			'.find(options?: QueryTerminalOptions): Promise<',
		)
		expect(deletion.display).toContain('.deleteOne(input:')
		expect(deletion.display).toContain('options?: QueryTerminalOptions')
		expect(deletion.documentation).toContain(
			'Deletes one uniquely identified row',
		)
		expect(count.display).toContain(
			'.count(options?: QueryTerminalOptions): Promise<number>',
		)
		expect(exists.display).toContain(
			'.exists(options?: QueryTerminalOptions): Promise<boolean>',
		)
		for (const terminal of [find, deletion, count, exists]) {
			expect(terminal.display).not.toContain('(this:')
		}
	})

	it('preserves trusted terminal authority documentation through the package', () => {
		const master = readFixtureQuickInfo('useMasterKey: true')
		const context = readFixtureQuickInfo('context: packedContext')

		expect(master.display).toContain('useMasterKey?: true')
		expect(master.documentation).toContain('trusted backend code only')
		expect(master.documentation).toContain('Transport input')
		expect(context.display).toContain('context?: RequestContext')
		expect(context.documentation).toContain('plugin-derived context')
	})

	it('materializes only selected fields in editor hovers', () => {
		const found = readFixtureQuickInfo('found = await PostSchema')

		// Selected terminals must not expose the complete schema behind a Pick alias.
		expect(found.display).toContain('readonly id: string;')
		expect(found.display).toContain('readonly title: string;')
		expect(found.display).not.toContain('readonly published: boolean;')
		expect(found.display).not.toContain('readonly views: number;')
		expect(found.display).not.toContain('Pick<')
	})

	it('materializes unified update data in editor hovers', () => {
		const update = readFixtureQuickInfo(
			"data: { title: 'Packed query update' }",
		)
		const inputDisplay = update.display

		// Developers should see field values and operations instead of the complete schema.
		expect(inputDisplay).toContain(
			'readonly attachment: Uint8Array<ArrayBufferLike> | null;',
		)
		expect(inputDisplay).toContain(
			'readonly exactAmount?: string | IncrementUpdateValue<string>',
		)
		expect(inputDisplay).toContain('DecrementUpdateValue<string> | null;')
		expect(inputDisplay).not.toContain('UpdateExpressionInput<')
		expect(inputDisplay).not.toContain('SchemaDefinition<')
		expect(inputDisplay).not.toContain('NonDefaultedIntField<')
		expect(update.documentation).toContain(
			'Applies typed atomic field operations',
		)
	})
})

describe('@ultimabase/core Runtime declarations', () => {
	it('exposes the documented UltimaBase facade and compact contextual Query', () => {
		const facade = readFixtureQuickInfo('UltimaBase({')
		const query = readFixtureQuickInfo('packedQuery = PostSchema.query()')

		expect(facade.display).toContain('new UltimaBase<')
		expect(facade.documentation).toContain(
			'Owns one isolated UltimaBase application',
		)
		expect(query.display).toContain('Query<')
		expect(query.display).not.toContain('RequestEngine<')
		expect(query.display).not.toContain('SchemaDefinition<')
	})

	it('preserves ambient hook model typing without context plumbing', () => {
		const result = readFixtureQuickInfo(
			'create()\n\n\t\t\tif (operation.input.title',
		)

		expect(result.display).toContain('create(options?: QueryTerminalOptions)')
		expect(result.display).not.toContain('RequestEngine<')
	})
})
