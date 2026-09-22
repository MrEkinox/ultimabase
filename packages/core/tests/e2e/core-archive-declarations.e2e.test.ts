import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface DeclarationQuickInfo {
	readonly display: string
	readonly documentation: string
}

// Inspect built declarations and bundles, never source aliases.
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const packagesDirectory = path.join(repositoryRoot, 'packages')
// Keep editor probes aligned with the fixture's original declaration order.
const schemaFixtureFiles = [
	'runtime-postgres-fixture.ts',
	'register-runtime-bulk-tests.ts',
	'runtime-postgres.postgres.e2e.test.ts',
].map((file) => path.join(import.meta.dirname, file))
const schemaFixtureSources = new Map(
	await Promise.all(
		schemaFixtureFiles.map(
			async (file) => [file, await readFile(file, 'utf8')] as const,
		),
	),
)
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
	getScriptFileNames: () => schemaFixtureFiles,
	getScriptSnapshot: (fileName) => {
		const contents =
			schemaFixtureSources.get(fileName) ?? ts.sys.readFile(fileName)

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

const readFixtureQuickInfo = (propertySource: string): DeclarationQuickInfo => {
	const match = schemaFixtureFiles
		.map((file) => ({
			file,
			position: schemaFixtureSources.get(file)?.indexOf(propertySource) ?? -1,
		}))
		.find(({ position }) => position >= 0)

	if (match === undefined) {
		throw new TypeError(`Missing schema hover fixture: ${propertySource}`)
	}

	const quickInfo = schemaLanguageService.getQuickInfoAtPosition(
		match.file,
		match.position,
	)

	return {
		display: quickInfo?.displayParts?.map(({ text }) => text).join('') ?? '',
		documentation:
			quickInfo?.documentation?.map(({ text }) => text).join('') ?? '',
	}
}

describe('@ultimabase/core Schema, QueryBuilder, and Runtime declarations', () => {
	it('keeps the packed Core archive independent from optional Hooks', async () => {
		const coreDirectory = path.join(packagesDirectory, 'core')
		const packedSurfaces = await Promise.all([
			readFile(path.join(coreDirectory, 'package.json'), 'utf8'),
			readFile(path.join(coreDirectory, 'dist', 'index.d.ts'), 'utf8'),
			readFile(path.join(coreDirectory, 'dist', 'index.js'), 'utf8'),
			readFile(path.join(coreDirectory, 'dist', 'index.js.map'), 'utf8'),
		])

		for (const surface of packedSurfaces) {
			expect(surface).not.toContain('@ultimabase/hooks-plugin')
		}
	})

	it('exports only the guarded Query-expression traversal contract', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		for (const publicName of [
			'GuardedQueryExpressionNode',
			'QueryExpressionTraversalDirective',
			'QueryExpressionVisitor',
			'traverseQueryExpression',
		]) {
			expect(declarations).toContain(publicName)
		}
	})

	it('keeps Query scope and execution ownership private', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		for (const internalName of [
			'QueryExecutionInput',
			'QueryRelationScopeInput',
			'executeQueryWithPrivateScope',
			'hydrateQueryFromAst',
			'readQueryPrivateScope',
			'scopeQueryToObjectId',
			'scopeQueryToRelation',
			'storeQueryPrivateScope',
		]) {
			expect(declarations).not.toContain(internalName)
		}
	})

	it('omits removed Query mutation helpers from packed implementation sources', async () => {
		const sourceMap = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.js.map'),
			'utf8',
		)

		for (const removedName of [
			'executeSchemaCreateMany',
			'executeQueryUpdateMany',
			'executeSchemaUpsertMany',
			'executeQueryDeleteMany',
		]) {
			expect(sourceMap).not.toContain(removedName)
		}
	})

	it('omits application field validation from packed Core surfaces', async () => {
		const coreDirectory = path.join(packagesDirectory, 'core', 'dist')
		const packedSurfaces = await Promise.all([
			readFile(path.join(coreDirectory, 'index.d.ts'), 'utf8'),
			readFile(path.join(coreDirectory, 'index.js.map'), 'utf8'),
		])

		for (const removedName of [
			'BigintRangeValidationOptions',
			'BigintValidationOptions',
			'BinaryLengthValidationOptions',
			'FieldValidationOptions',
			'StringValidationOptions',
			'StringLengthValidationOptions',
			'BinaryValidationOptions',
			'BooleanValidationOptions',
			'DateRangeValidationOptions',
			'DateValidationOptions',
			'DateTimeRangeValidationOptions',
			'DateTimeValidationOptions',
			'DecimalRangeValidationOptions',
			'DecimalValidationOptions',
			'FloatRangeValidationOptions',
			'FloatValidationOptions',
			'IntRangeValidationOptions',
			'IntValidationOptions',
			'TimeRangeValidationOptions',
			'TimeValidationOptions',
			'UuidValidationOptions',
			'UuidVersion',
			'normalizeValidation',
			'validateScalarFieldConstraints',
		]) {
			for (const surface of packedSurfaces) {
				expect(surface).not.toContain(removedName)
			}
		}

		for (const surface of packedSurfaces) {
			expect(surface).not.toContain('FieldStandardSchema')
		}
		const validationDeclarations = await readFile(
			path.join(packagesDirectory, 'validation-plugin', 'dist', 'index.d.ts'),
			'utf8',
		)
		expect(validationDeclarations).toContain('FieldStandardSchema')
	})

	it('keeps Runtime orchestration implementation private', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		for (const internalName of [
			'RuntimeDatabaseExecution',
			'RuntimeDatabaseExecutionRequest',
			'RuntimeInclusionProjector',
			'RuntimePreparedInclusion',
			'createRuntimeOperationInput',
			'executeRuntimeDatabaseOperation',
			'retainRuntimeMutationBatchProjector',
			'snapshotRuntimeConstraints',
		]) {
			expect(declarations).not.toContain(internalName)
		}
	})

	it('keeps Enforcement coordination implementation private', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		for (const internalName of [
			'OwnedEnforcementContribution',
			'createRelationPredicateEvaluator',
			'enforceOperationRestrictions',
			'enforceOutputRestrictions',
			'enforceSelectionResultRestrictions',
			'evaluateEnforcementContributions',
			'normalizeEnforcementRestrictedFields',
			'readEnforcementContributions',
			'readEnforcementOperationSchema',
		]) {
			expect(declarations).not.toContain(internalName)
		}
	})

	it('keeps removed Core Access dispatch implementation absent', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		for (const internalName of [
			'NativeAccessRuntime',
			'AccessRuleIdentity',
			'accessFieldPathsEqual',
			'enforceAccessOutput',
			'enforceAccessPreparedMutation',
			'evaluateAccessMutationFieldRules',
			'evaluateAccessOperationAndFilter',
		]) {
			expect(declarations).not.toContain(internalName)
		}
	})

	it('exposes the documented Schema definition factory', () => {
		const schema = readFixtureQuickInfo('define({')

		// The packed declaration must retain the class-level help shown by editors.
		expect(schema.display).toContain('Schema.define<')
		expect(schema.documentation).toContain(
			'Defines one final schema-specific class',
		)
	}, 10_000)

	it('keeps the no-Typegen draft fallback minimal and exposes QueryBuilder', () => {
		const draft = readFixtureQuickInfo('packedDraft = new PostSchema')
		const query = readFixtureQuickInfo(
			'packedQuery = new QueryBuilder(PostSchema)',
		)

		expect(draft.display).toContain('readonly [x: string]: unknown;')
		expect(draft.display).not.toContain('readonly title: string;')
		expect(query.display).toContain('QueryBuilder<')
		expect(query.display).not.toContain('NonDefaultedStringField<')
	})

	it('preserves compact immutable model persistence commands', () => {
		const create = readFixtureQuickInfo('create({}, { useMasterKey: true })')
		const update = readFixtureQuickInfo(
			"update({ data: { title: 'Packed update' } })",
		)
		const fetch = readFixtureQuickInfo('fetch({ select: { title: true } })')
		const toPointer = readFixtureQuickInfo('toPointer()')

		expect(create.display).toContain('create(input:')
		expect(create.display).toContain('Promise<{')
		expect(create.documentation).toContain('complete model')
		expect(update.display).toContain('update(input:')
		expect(update.display).toContain('Promise<{')
		expect(update.documentation).toContain('protected object identity')
		expect(fetch.display).toContain('fetch<')
		expect(fetch.documentation).toContain('selected fresh fields')
		expect(toPointer.display).toContain('Pointer<')
		expect(toPointer.documentation).toContain('without performing database I/O')
		expect(create.display).not.toContain('NonDefaultedStringField<')
		expect(update.display).not.toContain('NonDefaultedStringField<')
		expect(fetch.display).not.toContain('NonDefaultedStringField<')
	})

	it('preserves the atomic bulk array result', () => {
		const bulk = readFixtureQuickInfo('packedAtomicCreate = () =>')

		expect(bulk.display).toContain('Promise<readonly {')
		expect(bulk.display).not.toContain("status: 'stopped'")
	})

	it('preserves field option documentation through package exports', () => {
		const required = readFixtureQuickInfo('required: true')

		// Compiled declarations expose direct required presence without a nullable switch.
		expect(required.display).toContain('(property) required?: true')
		expect(required.display).not.toContain('StringValidationOptions')
		expect(required.display).not.toContain('nullable')
		expect(required.documentation).toContain(
			'Requires a non-null persisted value',
		)
		expect(readFixtureQuickInfo('required: true }').documentation).toContain(
			'requires create input',
		)
	})

	it('keeps no-Typegen mutation hovers on the minimal generated fallback', () => {
		const created = readFixtureQuickInfo('created = await PostSchema')
		const selected = readFixtureQuickInfo('selectedCreate = await PostSchema')
		const deleted = readFixtureQuickInfo('deleted = await PostSchema')
		const bulkUpdated = readFixtureQuickInfo(
			'bulkUpdated = await BulkAccountSchema',
		)
		const create = readFixtureQuickInfo(
			'createOne(\n\t\t\t\t{ data: allFieldValues },',
		)

		// Exact application fields come only from the generated application contract.
		for (const result of [created, selected, deleted, bulkUpdated]) {
			expect(result.display).toContain('readonly [x: string]: unknown;')
			expect(result.display).toContain('readonly id: string;')
			expect(result.display).not.toContain('readonly externalId:')
			expect(result.display).not.toContain('NonDefaultedStringField<')
		}
		// Contextual execution stays in the optional final argument.
		expect(create.display).toContain('.createOne<')
		expect(create.display).toContain('input: SchemaCreateOneInput<')
		expect(create.display).toContain('options?: OperationOptions')
		expect(create.display).not.toContain('create(this:')
	})

	it('keeps immutable read builders and schema command hovers focused', () => {
		const select = readFixtureQuickInfo('select({ id: true, title: true })')
		const find = readFixtureQuickInfo(
			'findMany(undefined, { useMasterKey: true })',
		)
		const deletion = readFixtureQuickInfo('deleteOne(')
		const count = readFixtureQuickInfo('count(undefined, { ultimabase })')
		const exists = readFixtureQuickInfo('exists(undefined, { ultimabase })')

		// Selection inference retains the literal object needed by true/false projection.
		expect(select.display).toContain('select<{')
		expect(select.display).toContain('id: true')
		expect(select.display).toContain('title: true')
		// Schema reads use the deliberate minimal contract before code generation.
		expect(find.display).toContain(
			'ExactGeneratedFindManyInput<BaseSchemaTypeInfo<"RuntimePost">',
		)
		expect(deletion.display).toContain('.deleteOne<')
		expect(deletion.display).toContain('input: SchemaDeleteOneInput<')
		expect(deletion.display).toContain('options?: OperationOptions')
		expect(deletion.documentation).toContain('Deletes one unique target')
		expect(count.display).toContain('.count(input?: Readonly<{')
		expect(count.display).toContain(
			'options?: OperationOptions): Promise<number>',
		)
		expect(exists.display).toContain('.exists(input?: Readonly<{')
		expect(exists.display).toContain(
			'options?: OperationOptions): Promise<boolean>',
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

	it('does not infer selected application fields without code generation', () => {
		const found = readFixtureQuickInfo('found = await PostSchema')

		expect(found.display).toContain('readonly [x: string]: unknown;')
		expect(found.display).toContain('readonly id: string;')
		expect(found.display).not.toContain('readonly title: string;')
		expect(found.display).not.toContain('NonDefaultedStringField<')
	})

	it('keeps update data generic until code generation supplies its contract', () => {
		const update = readFixtureQuickInfo(
			"data: { title: 'Packed query update' }",
		)
		const inputDisplay = update.display

		expect(inputDisplay).toContain('readonly [x: string]: unknown;')
		expect(inputDisplay).not.toContain('readonly attachment:')
		expect(inputDisplay).not.toContain('UpdateExpressionInput<')
		expect(inputDisplay).not.toContain('SchemaDefinition<')
		expect(inputDisplay).not.toContain('NonDefaultedIntField<')
		expect(update.documentation).toContain(
			'Applies scalar operators and nested relationship commands',
		)
	})
})

describe('@ultimabase/core Runtime declarations', () => {
	it('ships callback attribution without public Master context minting', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)
		const authorityStart = declarations.indexOf('declare class MasterAuthority')
		const authorityEnd = declarations.indexOf('//#endregion', authorityStart)
		const authorityDeclaration = declarations.slice(
			authorityStart,
			authorityEnd,
		)

		expect(declarations).toContain('interface ApplicationCallbackExecutor')
		expect(declarations).toContain(
			'readonly callbacks: ApplicationCallbackExecutor',
		)
		expect(authorityDeclaration).not.toContain('elevate(')
	})

	it('ships the explicit unverified-transport protection contract', async () => {
		const declarations = await readFile(
			path.join(packagesDirectory, 'core', 'dist', 'index.d.ts'),
			'utf8',
		)

		expect(declarations).toContain('acknowledgeUnverifiedProtection?: true')
		expect(declarations).toContain('PublicTransportProtectionWarning')
		expect(declarations).toContain('UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION')
		expect(declarations).toContain('readonly coverage: "unverified"')
		expect(declarations).not.toContain('acknowledgeUnprotected')
		expect(declarations).not.toContain('UnprotectedPublicTransportWarning')
	})

	it('exposes the documented UltimaBase facade and compact QueryBuilder', () => {
		const facade = readFixtureQuickInfo('UltimaBase({')
		const query = readFixtureQuickInfo(
			'packedQuery = new QueryBuilder(PostSchema)',
		)

		expect(facade.display).toContain('new UltimaBase<')
		expect(facade.documentation).toContain(
			'Owns one isolated UltimaBase application',
		)
		expect(query.display).toContain('QueryBuilder<')
		expect(query.display).not.toContain('RequestEngine<')
		expect(query.display).not.toContain('SchemaDefinition<')
	})

	it('preserves ambient hook model typing without context plumbing', () => {
		const result = readFixtureQuickInfo('create({})')

		expect(result.display).toContain('create(input:')
		expect(result.display).toContain('options?: OperationOptions')
		expect(result.display).not.toContain('RequestEngine<')
	})
})
