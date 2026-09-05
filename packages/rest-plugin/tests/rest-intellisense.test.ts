import path from 'node:path'
import ts from 'typescript'

import { FrameworkApplication, Schema } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { restPlugin } from '../src/index.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'rest-intellisense.fixture.ts',
)

const markerPosition = (source: string, marker: string): number => {
	const position = source.indexOf(marker)
	if (position < 0)
		throw new TypeError(`Missing REST IntelliSense marker: ${marker}`)
	return position
}

describe('REST option IntelliSense', () => {
	it('contributes only inert exact option declarations to Typegen', () => {
		const Post = Schema.define({
			className: 'RestTypegenPost',
			fields: (field) => ({ title: field.string() }),
		})
		const generated = generateApplicationTypes({
			application: new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [restPlugin()],
				schemas: [Post],
			}),
			applicationId: 'fixture.rest-options',
		})
		const schemaMarker = '/* schema-options */'
		const routeMarker = '/* route-options */'
		const hoverMarker = '/* count-hover */'
		const sourceWithMarkers = `${generated.contents.replaceAll(
			'"@ultimabase/rest-plugin"',
			'"../src/index.js"',
		)}
import { Schema } from '@ultimabase/core'
Schema.define({
  className: 'RestCompletion',
  rest: { ${hoverMarker}count: true },
  fields: () => ({}),
})
Schema.define({
  className: 'RestRouteCompletion',
  rest: { ${routeMarker} },
  fields: () => ({}),
})
Schema.define({
  className: 'RestSchemaCompletion',
  ${schemaMarker}
  fields: () => ({}),
})
`
		const schemaPosition = markerPosition(sourceWithMarkers, schemaMarker)
		const routePosition = markerPosition(sourceWithMarkers, routeMarker)
		const hoverPosition = markerPosition(sourceWithMarkers, hoverMarker)
		const source = sourceWithMarkers
			.replace(schemaMarker, ' '.repeat(schemaMarker.length))
			.replace(routeMarker, ' '.repeat(routeMarker.length))
			.replace(hoverMarker, ' '.repeat(hoverMarker.length))
		const service = createLanguageService(fixtureFile, source)
		const completions = (position: number): readonly string[] =>
			service
				.getCompletionsAtPosition(fixtureFile, position, {})
				?.entries.map(({ name }) => name) ?? []
		const hover = service.getQuickInfoAtPosition(
			fixtureFile,
			hoverPosition + hoverMarker.length,
		)

		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
		expect(completions(schemaPosition)).toContain('rest')
		expect(completions(routePosition)).toEqual(
			expect.arrayContaining([
				'bulk',
				'count',
				'create',
				'delete',
				'exists',
				'find',
				'first',
				'get',
				'update',
				'upsert',
			]),
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'Generates the GET and POST count routes',
		)
		expect(generated.contents).toContain('RestSchemaRoutesOption')
		expect(generated.contents).not.toContain('/api/v1/classes')
		service.dispose()
	})
})
