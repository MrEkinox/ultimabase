import path from 'node:path'

import {
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	FrameworkApplication,
	Schema,
} from '@ultimabase/core'
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
	const method = defineFieldBuilderMethod({
		factory: containedField,
		fieldKind: 'fixture.semantic.contained',
		name: 'contained',
		typegen: {
			methodType: 'ContainmentFieldBuilderMethod',
			module: '@fixture/containment-plugin',
			structuralContainsType: 'ContainsOperand',
			valueType: 'ContainedValue',
		},
	})
	const plugin = definePlugin({
		core: '^0.0.0',
		declare: ({ fields }) => {
			fields.register(method)
			return undefined
		},
		pluginId: 'fixture.semantic-containment-plugin',
		privileges: [
			{ name: 'schema:declare', reason: 'Declares the fixture field.' },
		],
		version: '0.0.0',
	})
	const Document = Schema.define({
		className: 'SemanticContainedDocument',
		fields: () => ({ value: containedField() }),
	})

	return generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [plugin],
			schemas: [Document],
		}),
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
