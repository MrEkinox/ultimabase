import path from 'node:path'

import {
	FrameworkApplication,
	QueryBuilder,
	Schema,
	defineOperation,
	defineOperationValue,
	definePlugin,
	defineQueryExtension,
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
	const Dynamic = Schema.define({
		className: 'SemanticDynamicPost',
		fields: (field) => ({ title: field.string() }),
	})
	const publish = defineOperation({
		input: defineOperationValue(
			(value) => value as { readonly id: string },
			inputReference,
		),
		name: 'fixture.semantic.publish',
		result: defineOperationValue(
			(value) => value as Readonly<Record<string, unknown>>,
			resultReference,
		),
		target: 'schema',
		transaction: 'required',
		version: '1.0.0',
	})
	const byId = defineQueryExtension({
		apply: (schema, input: { readonly id: string }) =>
			new QueryBuilder(schema).where({ id: { eq: input.id } }),
		input: defineOperationValue(
			(value) => value as { readonly id: string },
			inputReference,
		),
		name: 'fixture.semantic.by-id',
		version: '1.0.0',
	})
	const plugin = definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.semantic-surfaces',
		version: '1.0.0',
		privileges: [
			{ name: 'schema:declare', reason: 'Declares the dynamic schema.' },
			{ name: 'operation:declare', reason: 'Declares publish.' },
			{ name: 'model:extend', reason: 'Adds publish.' },
			{ name: 'query:extend', reason: 'Adds byId.' },
			{ name: 'typegen:reference', reason: 'References public Core types.' },
		],
		declare: ({ models, operations, queries, schemas, typegenReferences }) => {
			typegenReferences.register(inputReference)
			typegenReferences.register(resultReference)
			schemas.add({ contributionId: 'dynamic', schema: Dynamic })
			operations.declare(publish)
			models.extend(Dynamic, {
				contributionId: 'publish',
				schemaCommands: { publish },
			})
			queries.extend(Dynamic, {
				contributionId: 'by-id',
				extensions: { byId },
			})
		},
	})
	return generateApplicationTypes({
		application: new FrameworkApplication({
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
declare const ultimabase: Core.UltimaBase<readonly [], readonly []>
const schema = ultimabase.schema('SemanticDynamicPost')
const envelope = schema.publish.prepare({ id: 'post-1' })
const exactId: string = envelope.payload.id
const query = schema.byId({ id: 'post-1' })
const operation = ultimabase.operation('fixture.semantic.publish')
operation.prepare({ id: 'post-2' })
// @ts-expect-error -- Generated dynamic handles reject unknown plugin aliases.
schema.unknownPluginSurface
// @ts-expect-error -- Exact generated operation input requires id.
operation.prepare({ missing: true })
void exactId
void query
`
			const fileName = path.join(
				import.meta.dirname,
				`plugin-surfaces-${_}.fixture.ts`,
			)
			const diagnostics = createService(
				fileName,
				source,
				corePath,
			).getSemanticDiagnostics(fileName)

			expect(diagnostics).toStrictEqual([])
			expect(source).not.toMatch(/\bany\b/u)
		},
	)
})
