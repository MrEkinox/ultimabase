import path from 'node:path'
import ts from 'typescript'

import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const markerPosition = (source: string, marker: string): number => {
	const position = source.indexOf(marker)
	if (position < 0) {
		throw new TypeError(`Missing GraphQL IntelliSense marker: ${marker}`)
	}
	return position
}

describe('GraphQL option IntelliSense', () => {
	describe.each([
		['source', '../src/index.js'],
		['packed', '@ultimabase/graphql-plugin'],
	] as const)('%s configured factory', (mode, moduleName) => {
		it('types exposure from the installed plugin', () => {
			const fileName = path.join(
				import.meta.dirname,
				`graphql-configured-${mode}.fixture.ts`,
			)
			const schemaMarker = '/* schema-options */'
			const methodMarker = '/* method-options */'
			const hoverMarker = '/* count-hover */'
			const sourceWithMarkers = `import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '${moduleName}'
const App = UltimaBase.use(graphqlPlugin())
const Post = App.Schema.define({
  className: 'ConfiguredGraphqlPost',
  fields: (field) => ({ title: field.string() }),
}).with({ graphql: { ${hoverMarker}count: true, typeName: 'Article' } })
App.Schema.define({
  className: 'GraphqlMethodCompletion',
  fields: () => ({}),
}).with({ graphql: { ${methodMarker} } })
App.Schema.define({
  className: 'GraphqlSchemaCompletion',
  fields: () => ({}),
}).with({ ${schemaMarker} })
void Post`
			const schemaPosition = markerPosition(sourceWithMarkers, schemaMarker)
			const methodPosition = markerPosition(sourceWithMarkers, methodMarker)
			const hoverPosition = markerPosition(sourceWithMarkers, hoverMarker)
			const source = sourceWithMarkers
				.replace(schemaMarker, ' '.repeat(schemaMarker.length))
				.replace(methodMarker, ' '.repeat(methodMarker.length))
				.replace(hoverMarker, ' '.repeat(hoverMarker.length))
			const service = createLanguageService(fileName, source)
			const completions = (position: number): readonly string[] =>
				service
					.getCompletionsAtPosition(fileName, position, {})
					?.entries.map(({ name }) => name) ?? []
			const diagnostics = service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				)
			const hover = service.getQuickInfoAtPosition(
				fileName,
				hoverPosition + hoverMarker.length,
			)

			expect(diagnostics).toStrictEqual([])
			expect(completions(schemaPosition)).toContain('graphql')
			// The keys are the schema method names, as REST (ADR-0325).
			expect(completions(methodPosition)).toEqual(
				expect.arrayContaining([
					'count',
					'createMany',
					'createOne',
					'deleteMany',
					'deleteOne',
					'exists',
					'findMany',
					'findOne',
					'typeName',
					'updateMany',
					'updateOne',
					'upsertMany',
					'upsertOne',
				]),
			)
			expect(ts.displayPartsToString(hover?.displayParts)).toBe(
				'(property) GraphqlMethodRules.count?: boolean',
			)
			service.dispose()
		})

		it('rejects GraphQL options on an unrelated factory', () => {
			const fileName = path.join(
				import.meta.dirname,
				`graphql-absent-${mode}.fixture.ts`,
			)
			const source = `import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { graphqlPlugin } from '${moduleName}'
void graphqlPlugin
const Other = UltimaBase.use(httpPlugin({ appId: 'unrelated' }))
Other.Schema.define({
  className: 'GraphqlAbsentPost',
  fields: () => ({}),
}).with({ graphql: { count: true } })`
			const service = createLanguageService(fileName, source)
			const messages = service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				)
			expect(messages.some((message) => message.includes('graphql'))).toBe(true)
			service.dispose()
		})

		it('rejects invalid GraphQL operation values', () => {
			const fileName = path.join(
				import.meta.dirname,
				`graphql-invalid-${mode}.fixture.ts`,
			)
			const source = `import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '${moduleName}'
const App = UltimaBase.use(graphqlPlugin())
App.Schema.define({
  className: 'InvalidGraphqlPost',
  fields: () => ({}),
}).with({ graphql: { count: 'yes' } })`
			const service = createLanguageService(fileName, source)
			const messages = service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				)
			expect(messages).toStrictEqual([
				"Type 'string' is not assignable to type 'boolean | undefined'.",
			])
			service.dispose()
		})
	})
})
