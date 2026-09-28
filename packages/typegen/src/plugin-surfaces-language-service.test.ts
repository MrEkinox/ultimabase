import path from 'node:path'

import {
	UltimaBase,
	Schema,
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
	const Dynamic = Schema.define({
		className: 'SemanticDynamicPost',
		fields: (field) => ({ title: field.string() }),
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
		ultimabase: new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
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
import { Schema } from '@ultimabase/core'
declare const ultimabase: Core.UltimaBase<readonly [], readonly []>
const StaticPost = Schema.define({
	className: 'SemanticDynamicPost',
	fields: (field) => ({ title: field.string() }),
})
const staticMutation = StaticPost.softDelete({ id: 'post-1' }, { ultimabase })
const staticArchive = StaticPost.archive({ id: 'post-1', input: { id: 'reason-1' }, select: { title: true } }, { ultimabase })
const schema = ultimabase.schema('SemanticDynamicPost')
const envelope = ultimabase.operation('fixture.semantic.publish').prepare({ id: 'post-1' })
const archiveExecution = schema.archive({ id: 'post-1', input: { id: 'reason-1' }, select: { title: true } })
const softDeleteExecution = schema.softDelete({ id: 'post-1' })
const exactId: string = envelope.payload.id
const query = schema.findMany({ where: { id: { eq: "post-1" } } })
const operation = ultimabase.operation('fixture.semantic.publish')
operation.prepare({ id: 'post-2' })
const operationExecution: Promise<Core.BaseItem> = operation.execute({ id: 'post-2' })
const operationError: Core.PluginOperationErrorCode<typeof operation.definition> = 'fixture.semantic.rejected'
const directSchema = schema.schema
const useModelCommands = async () => {
	const archived = await schema.archive({ id: 'post-1', input: { id: 'reason-5' }, select: { title: true } })
	const archivedTitle: string | null = archived.title
	// @ts-expect-error -- Exact schema mutation results omit unselected fields.
	archived.createdAt
	const deleted = await schema.softDelete({ id: 'post-1' }, { useMasterKey: true })
	const deletedTitle: string | null = deleted.title
	const fromHandle = await schema.findOne()
	const fromSchema = await directSchema.findOne(undefined, { ultimabase })
	if (fromHandle !== null) {
		const archiveResult = fromHandle.archive({ input: { id: 'reason-2' }, select: { title: true } })
		const softDeleteResult = fromHandle.softDelete()
		// @ts-expect-error -- Arbitrary operation commands are no longer generated.
		fromHandle.publish({ missing: true })
		// @ts-expect-error -- Payload-bearing mutations require their input property.
		fromHandle.archive({ select: { title: true } })
		// @ts-expect-error -- Payload-free model mutations omit the input property.
		fromHandle.softDelete({ input: undefined })
		void archiveResult
		void softDeleteResult
	}
	if (fromSchema !== null) {
		const schemaResult = fromSchema.softDelete()
		void schemaResult
	}
	void archivedTitle
	void deletedTitle
}
// @ts-expect-error -- Generated dynamic handles reject unknown plugin aliases.
schema.unknownPluginSurface
// @ts-expect-error -- Arbitrary schema commands do not become class-level mutations.
StaticPost.publish({ id: 'post-1' }, { ultimabase })
// @ts-expect-error -- Class-level mutations retain exact target input.
StaticPost.softDelete({ missing: 'post-1' }, { ultimabase })
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
			expect(source).not.toMatch(/\bany\b/u)
		},
	)
})
