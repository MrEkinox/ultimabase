import path from 'node:path'

import {
	definePluginFieldFamily,
	definePluginField,
	UltimaBase,
} from '@ultimabase/core'
import {
	plugin as createPlugin,
	contributeDeclarations,
} from '@ultimabase/core/plugin'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createGeneratedRegistry = (): string => {
	const containedField = () =>
		definePluginField(
			'fixture.semantic.contained',
			{ required: true },
			{
				snapshotValue: (value: unknown) => value,
				storageCodec: {
					decode: (value) => value,
					encode: (value) => value,
					format: 'json',
					version: 1,
				},
				structuralContains: {
					snapshotOperand: (value: unknown) => value,
				},
			},
		)
	const method = definePluginFieldFamily({
		fieldKind: 'fixture.semantic.contained',
		typegen: {
			module: '@fixture/containment-plugin',
			structuralContainsType: 'ContainsOperand',
			valueType: 'ContainedValue',
		},
		builder: {
			name: 'contained',
			contexts: {
				stored: {
					factory: containedField,
					methodType: 'ContainmentFieldBuilderMethod',
				},
			},
		},
	})
	const plugin = createPlugin({
		core: '^0.0.0',
		id: 'fixture.semantic-containment-plugin',
		permissions: { 'schema:declare': 'Declares the fixture field.' },
		version: '0.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ fields }) => {
					fields.register(method)
					return undefined
				},
			}),
		],
	})
	const Application = UltimaBase.use(plugin)
	const Document = Application.Schema.define({
		className: 'SemanticContainedDocument',
		fields: () => ({ value: containedField() }),
	})

	return generateApplicationTypes({
		ultimabase: new Application({ schemas: [Document] }),
		applicationId: 'fixture.semantic-containment',
	}).contents
}

const pluginDeclaration = `
import type { FieldOptions, PluginFieldDefinition } from '@ultimabase/core'
export interface ContainedValue {
  readonly complete: string
}
export interface ContainsOperand {
  readonly prefix: string
  readonly tags?: readonly string[]
}
export type ContainmentFieldBuilderMethod = (
  options?: FieldOptions<ContainedValue>
) => PluginFieldDefinition<'fixture.semantic.contained', ContainedValue>
`

const createLanguageService = (
	fileName: string,
	source: string,
	pluginFileName: string,
): ts.LanguageService => {
	const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
	const files = new Map<string, string>([
		[fileName, source],
		[pluginFileName, pluginDeclaration],
	])
	const host: ts.LanguageServiceHost = {
		fileExists: (requested) =>
			files.has(requested) || ts.sys.fileExists(requested),
		getCompilationSettings: () => ({
			baseUrl: repositoryRoot,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			paths: {
				'@fixture/containment-plugin': [pluginFileName],
				'@ultimabase/core': ['packages/core/src/index.ts'],
				'@ultimabase/core/plugin': ['packages/core/src/plugin.ts'],
				'@ultimabase/shared': ['packages/shared/src/index.ts'],
			},
			strict: true,
			target: ts.ScriptTarget.ESNext,
			types: ['node'],
		}),
		getCurrentDirectory: () => repositoryRoot,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getScriptFileNames: () => [...files.keys()],
		getScriptSnapshot: (requested) => {
			const contents = files.get(requested) ?? ts.sys.readFile(requested)
			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => '0',
		readFile: (requested) => files.get(requested) ?? ts.sys.readFile(requested),
	}

	return ts.createLanguageService(host)
}

describe('generated plugin field containment semantics', () => {
	it('offers the exact operand and rejects complete or unrelated values', () => {
		const registry = createGeneratedRegistry()
		const marker = '/* operand-completion */'
		const sourceWithMarker = `${registry}
const valid: SemanticContainedDocumentWhereInput = {
  value: { contains: { prefix: 'sem', ${marker} } },
}
const invalid: SemanticContainedDocumentWhereInput = {
  value: {
    // @ts-expect-error -- Containment uses the owner-declared partial operand.
    contains: { complete: 'not-a-containment-key' },
  },
}
void valid
void invalid
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = path.join(
			import.meta.dirname,
			'plugin-containment.semantic.fixture.ts',
		)
		const pluginFileName = path.join(
			import.meta.dirname,
			'containment-plugin.semantic.fixture.d.ts',
		)
		const service = createLanguageService(fileName, source, pluginFileName)

		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
		expect(
			service
				.getCompletionsAtPosition(fileName, position, {})
				?.entries.map(({ name }) => name),
		).toContain('tags')
		expect(registry).not.toContain('snapshotOperand')
	})
})
