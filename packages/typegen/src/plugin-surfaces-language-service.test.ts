import path from 'node:path'

import {
	UltimaBase,
	contributeDeclarations,
	defineOperation,
	defineOperationValue,
	plugin as createPlugin,
	defineSchemaMutation,
	defineTypegenReference,
} from '@ultimabase/core'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createGeneratedRegistry = (): string => {
	const inputReference = defineTypegenReference({
		exportName: 'BaseItem',
		module: '@ultimabase/core',
	})
	const resultReference = defineTypegenReference({
		exportName: 'BaseItem',
		module: '@ultimabase/core',
	})
	const noInputReference = defineTypegenReference({
		exportName: 'PluginSchemaMutationNoInput',
		module: '@ultimabase/core',
	})
	const Dynamic = UltimaBase.Schema.define({
		className: 'SemanticDynamicPost',
		fields: (field) => ({ title: field.string() }),
	})
	const Author = UltimaBase.Schema.define({
		className: 'SemanticSurfaceAuthor',
		fields: (field) => ({
			posts: field.relation({ target: 'SemanticDynamicPost' }),
		}),
	})
	const publish = defineOperation({
		errors: ['fixture.semantic.rejected'] as const,
		input: defineOperationValue(
			(value) => value as { readonly id: string },
			inputReference,
		),
		name: 'fixture.semantic.publish',
		result: defineOperationValue(
			(value) => value as Readonly<Record<string, unknown>>,
			resultReference,
		),
		target: 'application',
		transaction: 'required',
		version: '1.0.0',
	})
	const archive = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		errors: ['fixture.semantic.archive-rejected'] as const,
		input: defineOperationValue(
			(value) => value as { readonly id: string },
			inputReference,
		),
		name: 'fixture.semantic.archive',
		returning: 'after',
		select: { title: true },
		version: '1.0.0',
	})
	const softDelete = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: defineOperationValue((value, path) => {
			if (value !== undefined) throw new TypeError(`${path} must be undefined`)
			return undefined
		}, noInputReference),
		name: 'fixture.semantic.soft-delete',
		returning: 'after',
		version: '1.0.0',
	})
	const plugin = createPlugin({
		core: '^0.0.0',
		id: 'fixture.semantic-surfaces',
		version: '1.0.0',
		permissions: {
			'schema:declare': 'Declares the dynamic schema.',
			'operation:declare': 'Declares publish.',
			'model:extend': 'Adds publish.',
			'typegen:reference': 'References public Core types.',
		},
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.add({ contributionId: 'dynamic', schema: Dynamic })
					schemas.add({ contributionId: 'author', schema: Author })
				},
				operations: ({ operations }) => {
					operations.declare(publish)
					operations.declare(archive)
					operations.declare(softDelete)
				},
				models: ({ models }) => {
					models.extend(Dynamic, {
						contributionId: 'publish',
						schemaMutations: {
							archive: {
								mutation: archive,
								surfaces: ['schema', 'model'],
							},
							archiveSchemaOnly: { mutation: archive, surfaces: ['schema'] },
							archiveModelOnly: { mutation: archive, surfaces: ['model'] },
							softDelete: {
								mutation: softDelete,
								surfaces: ['schema', 'model'],
							},
						},
					})
				},
				typegen: ({ typegenReferences }) => {
					typegenReferences.register(inputReference)
					typegenReferences.register(resultReference)
					typegenReferences.register(noInputReference)
				},
			}),
		],
	})
	return generateApplicationTypes({
		ultimabase: new (UltimaBase.use(plugin))({
			pluginPrivileges: { logger: false },
			schemas: [],
		}),
		applicationId: 'fixture.semantic-surfaces',
	}).contents
}

const createService = (
	fileName: string,
	source: string,
	corePath: string,
): ts.LanguageService => {
	const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
	const host: ts.LanguageServiceHost = {
		fileExists: (requested) => ts.sys.fileExists(requested),
		getCompilationSettings: () => ({
			baseUrl: repositoryRoot,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			paths: {
				'@ultimabase/core': [corePath],
				'@ultimabase/shared': ['packages/shared/src/index.ts'],
			},
			strict: true,
			target: ts.ScriptTarget.ESNext,
			types: ['node'],
		}),
		getCurrentDirectory: () => repositoryRoot,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: (requested) => {
			const contents =
				requested === fileName ? source : ts.sys.readFile(requested)
			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => '0',
		readFile: (requested) => ts.sys.readFile(requested),
	}
	return ts.createLanguageService(host)
}

describe('generated plugin surface declarations', () => {
	it.each([
		['source', 'packages/core/src/index.ts'],
		['packed', 'packages/core/dist/index.d.ts'],
	])(
		'typechecks exact dynamic handles through %s Core exports',
		(_, corePath) => {
			const source = `${createGeneratedRegistry()}
import { UltimaBase } from '@ultimabase/core'
declare const ultimabase: Core.UltimaBase<readonly []>
const StaticPost = UltimaBase.Schema.define({
	className: 'SemanticDynamicPost',
	fields: (field) => ({ title: field.string() }),
})
const staticMutation = StaticPost.softDelete({ id: 'post-1' })
const staticArchive = StaticPost.archive({ id: 'post-1', input: { id: 'reason-1' }, select: { title: true } })
// @ts-expect-error -- Derived class methods retain exact mutation selection.
StaticPost.archive({ id: 'post-1', input: { id: 'reason-1' }, select: { missing: true } })
StaticPost.archiveSchemaOnly({ id: 'post-1', input: { id: 'reason-1' } })
// @ts-expect-error -- Sharing a descriptor does not expose model-only methods on classes.
StaticPost.archiveModelOnly
const schema = ultimabase.schema('SemanticDynamicPost')
const envelope = ultimabase.operation('fixture.semantic.publish').prepare({ id: 'post-1' })
const archiveExecution = schema.archive({ id: 'post-1', input: { id: 'reason-1' }, select: { title: true } })
const softDeleteExecution = schema.softDelete({ id: 'post-1' })
schema.archiveSchemaOnly({ id: 'post-1', input: { id: 'reason-1' } })
// @ts-expect-error -- Advanced schema handles preserve the declared surface.
schema.archiveModelOnly
const exactId: string = envelope.payload.id
const query = StaticPost.findMany({ where: { id: { eq: "post-1" } } })
// @ts-expect-error -- Ordinary terminals no longer select an application.
StaticPost.findMany(undefined, { ultimabase })
const operation = ultimabase.operation('fixture.semantic.publish')
operation.prepare({ id: 'post-2' })
const operationExecution: Promise<Core.BaseItem> = operation.execute({ id: 'post-2' })
const operationError: Core.PluginOperationErrorCode<typeof operation.definition> = 'fixture.semantic.rejected'
const directSchema = schema.schema
const Author = UltimaBase.Schema.define({
	className: 'SemanticSurfaceAuthor',
	fields: (field) => ({ posts: field.relation({ target: 'SemanticDynamicPost' }) }),
})
const useModelCommands = async () => {
	const archived = await schema.archive({ id: 'post-1', input: { id: 'reason-5' }, select: { title: true } })
	const archivedTitle: string | null = archived.title
	// @ts-expect-error -- Exact schema mutation results omit unselected fields.
	archived.createdAt
	const deleted = await schema.softDelete({ id: 'post-1' }, { useMasterKey: true })
	const deletedTitle: string | null = deleted.title
	const fromSchema = await directSchema.findOne()
	// @ts-expect-error -- The advanced handle does not duplicate ordinary CRUD.
	schema.findOne()
	if (fromSchema !== null) {
		fromSchema.archiveModelOnly({ input: { id: 'reason-2' } })
		// @ts-expect-error -- A canonical callback descriptor does not broaden model methods.
		fromSchema.archiveSchemaOnly
		const archiveResult = fromSchema.archive({ input: { id: 'reason-2' }, select: { title: true } })
		const softDeleteResult = fromSchema.softDelete()
		// @ts-expect-error -- Arbitrary operation commands are no longer generated.
		fromSchema.publish({ missing: true })
		// @ts-expect-error -- Payload-bearing mutations require their input property.
		fromSchema.archive({ select: { title: true } })
		// @ts-expect-error -- Payload-free model mutations omit the input property.
		fromSchema.softDelete({ input: undefined })
		void archiveResult
		void softDeleteResult
	}
	void archivedTitle
	void deletedTitle
}
const useRelatedModelCommands = async () => {
	const author = await Author.findOne()
	if (author === null) return
	for (const post of await author.relation('posts').findMany()) {
		const archived = await post.archive({ input: { id: 'reason-6' }, select: { title: true } })
		const title: string | null = archived.title
		await post.softDelete()
		// @ts-expect-error -- Named relation results retain model-only visibility.
		post.archiveSchemaOnly
		// @ts-expect-error -- Related model mutations still require their payload.
		post.archive({ select: { title: true } })
		void title
	}
}
// @ts-expect-error -- Generated dynamic handles reject unknown plugin aliases.
schema.unknownPluginSurface
// @ts-expect-error -- Arbitrary schema commands do not become class-level mutations.
StaticPost.publish({ id: 'post-1' })
// @ts-expect-error -- Class-level mutations retain exact target input.
StaticPost.softDelete({ missing: 'post-1' })
// @ts-expect-error -- Exact generated operation input requires id.
operation.prepare({ missing: true })
// @ts-expect-error -- Schema mutations require one exact target id.
schema.archive({ input: { id: 'reason-3' } })
// @ts-expect-error -- Schema mutation selections reject unknown fields.
schema.archive({ id: 'post-1', input: { id: 'reason-4' }, select: { missing: true } })
// @ts-expect-error -- Payload-free schema mutations omit the input property.
schema.softDelete({ id: 'post-1', input: undefined })
// @ts-expect-error -- Generated execution preserves declared public error codes.
const unknownError: Core.PluginOperationErrorCode<typeof operation.definition> = 'fixture.semantic.unknown'
// @ts-expect-error -- Core no longer exports the official Hooks callback context.
type RemovedHookContext = Core.HookContext
// @ts-expect-error -- Core no longer exports native schema Access contracts.
type RemovedSchemaAccess = Core.SchemaAccess
// @ts-expect-error -- Core no longer exports native field Access contracts.
type RemovedFieldAccess = Core.FieldAccess
void exactId
void query
void operationError
void operationExecution
void archiveExecution
void softDeleteExecution
void staticMutation
void staticArchive
void useModelCommands
void useRelatedModelCommands
void unknownError
void (undefined as unknown as RemovedHookContext)
void (undefined as unknown as RemovedSchemaAccess)
void (undefined as unknown as RemovedFieldAccess)
`
			const fileName = path.join(
				import.meta.dirname,
				`plugin-surfaces-${_}.fixture.ts`,
			)
			const service = createService(fileName, source, corePath)
			const diagnostics = service.getSemanticDiagnostics(fileName)
			const executePosition =
				source.indexOf('operation.execute') + 'operation.'.length
			const executeInfo = service.getQuickInfoAtPosition(
				fileName,
				executePosition,
			)
			const executeDisplay =
				executeInfo?.displayParts?.map(({ text }) => text).join('') ?? ''

			expect(diagnostics).toStrictEqual([])
			expect(executeDisplay).toContain('execute')
			expect(executeDisplay).toContain('): Promise<Readonly<')
			// Derivation changes generated shape, not the class editor surface.
			const classPosition =
				source.indexOf('StaticPost.archive(') + 'StaticPost.'.length
			const classCompletions = service.getCompletionsAtPosition(
				fileName,
				classPosition,
				{},
			)
			const classNames = classCompletions?.entries.map(({ name }) => name) ?? []
			expect(classNames).toEqual(
				expect.arrayContaining(['archive', 'archiveSchemaOnly', 'softDelete']),
			)
			expect(classNames).not.toContain('archiveModelOnly')
			const classDisplay =
				service
					.getQuickInfoAtPosition(fileName, classPosition)
					?.displayParts?.map(({ text }) => text)
					.join('') ?? ''
			expect(classDisplay).toContain('PluginSchemaMutationSchemaInput')
			expect(classDisplay).toContain('Schemas.SemanticDynamicPost')
			expect(classDisplay).toContain('=> Promise<')
			expect(source).not.toMatch(/\bany\b/u)
		},
	)
})
