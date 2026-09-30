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
		it('types exposure from the installed plugin without Typegen', () => {
			const fileName = path.join(
				import.meta.dirname,
				`graphql-configured-${mode}.fixture.ts`,
			)
			const schemaMarker = '/* schema-options */'
			const exposureMarker = '/* exposure-options */'
			const operationMarker = '/* operation-options */'
			const hoverMarker = '/* count-hover */'
			const sourceWithMarkers = `import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '${moduleName}'
const App = UltimaBase.use(graphqlPlugin())
const Post = App.Schema.define({
  className: 'ConfiguredGraphqlPost',
  graphql: { operations: { ${hoverMarker}count: true } },
  fields: (field) => ({ title: field.string() }),
})
App.Schema.define({
  className: 'GraphqlOperationCompletion',
  graphql: { operations: { ${operationMarker} } },
  fields: () => ({}),
})
App.Schema.define({
  className: 'GraphqlExposureCompletion',
  graphql: { ${exposureMarker} },
  fields: () => ({}),
})
App.Schema.define({
  className: 'GraphqlSchemaCompletion',
  ${schemaMarker}
  fields: () => ({}),
})
void Post`
			const schemaPosition = markerPosition(sourceWithMarkers, schemaMarker)
			const exposurePosition = markerPosition(sourceWithMarkers, exposureMarker)
			const operationPosition = markerPosition(
				sourceWithMarkers,
				operationMarker,
			)
			const hoverPosition = markerPosition(sourceWithMarkers, hoverMarker)
			const source = sourceWithMarkers
				.replace(schemaMarker, ' '.repeat(schemaMarker.length))
				.replace(exposureMarker, ' '.repeat(exposureMarker.length))
				.replace(operationMarker, ' '.repeat(operationMarker.length))
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
			expect(completions(exposurePosition)).toEqual(
				expect.arrayContaining(['operations', 'typeName']),
			)
			expect(completions(operationPosition)).toEqual(
				expect.arrayContaining([
					'bulk',
					'count',
					'create',
					'delete',
					'exists',
					'findMany',
					'findOne',
					'get',
					'mutations',
					'update',
					'upsert',
				]),
			)
			expect(ts.displayPartsToString(hover?.displayParts)).toContain(
				'count: true',
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
  graphql: { operations: { count: true } },
})`
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
  graphql: { operations: { count: 'yes' } },
  fields: () => ({}),
})`
			const service = createLanguageService(fileName, source)
			const messages = service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				)
			expect(messages).toHaveLength(1)
			expect(messages[0]).toContain('count: "yes"')
			expect(messages[0]).toContain('is not assignable')
			service.dispose()
		})
	})
})
