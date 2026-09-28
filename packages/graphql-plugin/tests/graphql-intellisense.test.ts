import path from 'node:path'

import { Schema, UltimaBase } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { graphqlPlugin } from '../src/index.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'graphql-intellisense.fixture.ts',
)

const markerPosition = (source: string, marker: string): number => {
	const position = source.indexOf(marker)
	if (position < 0) {
		throw new TypeError(`Missing GraphQL IntelliSense marker: ${marker}`)
	}
	return position
}

describe('GraphQL option IntelliSense', () => {
	it('contributes only inert exact schema option declarations to Typegen', () => {
		const Post = Schema.define({
			className: 'GraphqlTypegenPost',
			fields: (field) => ({ title: field.string() }),
		})
		const generated = generateApplicationTypes({
			ultimabase: new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Post],
			}),
			applicationId: 'fixture.graphql-options',
		})
		const schemaMarker = '/* schema-options */'
		const exposureMarker = '/* exposure-options */'
		const operationMarker = '/* operation-options */'
		const sourceWithMarkers = `${generated.contents.replaceAll(
			'"@ultimabase/graphql-plugin"',
			'"../src/index.js"',
		)}
import { Schema } from '@ultimabase/core'
Schema.define({
  className: 'GraphqlOperationCompletion',
  graphql: { operations: { ${operationMarker} } },
  fields: () => ({}),
})
Schema.define({
  className: 'GraphqlExposureCompletion',
  graphql: { ${exposureMarker} },
  fields: () => ({}),
})
Schema.define({
  className: 'GraphqlSchemaCompletion',
  ${schemaMarker}
  fields: () => ({}),
})
`
		const schemaPosition = markerPosition(sourceWithMarkers, schemaMarker)
		const exposurePosition = markerPosition(sourceWithMarkers, exposureMarker)
		const operationPosition = markerPosition(sourceWithMarkers, operationMarker)
		const source = sourceWithMarkers
			.replace(schemaMarker, ' '.repeat(schemaMarker.length))
			.replace(exposureMarker, ' '.repeat(exposureMarker.length))
			.replace(operationMarker, ' '.repeat(operationMarker.length))
		const service = createLanguageService(fixtureFile, source)
		const completions = (position: number): readonly string[] =>
			service
				.getCompletionsAtPosition(fixtureFile, position, {})
				?.entries.map(({ name }) => name) ?? []

		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
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
		expect(generated.contents).toContain('GraphqlSchemaExposureOption')
		expect(generated.contents).not.toContain('GraphQLSchema')
		service.dispose()
	})
})
