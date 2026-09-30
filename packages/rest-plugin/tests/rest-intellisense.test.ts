import path from 'node:path'
import ts from 'typescript'

import { UltimaBase, Schema } from '@ultimabase/core'
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
	describe.each([
		['source', '../src/index.js'],
		['packed', '@ultimabase/rest-plugin'],
	] as const)('%s configured factory', (mode, moduleName) => {
		it('types REST routes from the installed plugin without Typegen', () => {
			const fileName = path.join(
				import.meta.dirname,
				`rest-configured-${mode}.fixture.ts`,
			)
			const schemaMarker = '/* schema-options */'
			const routeMarker = '/* route-options */'
			const hoverMarker = '/* count-hover */'
			const sourceWithMarkers = `import { UltimaBase } from '@ultimabase/core'
import { restPlugin } from '${moduleName}'
const App = UltimaBase.use(restPlugin())
const Post = App.Schema.define({
  className: 'ConfiguredRestPost',
  rest: { ${hoverMarker}count: true },
  fields: (field) => ({ title: field.string() }),
})
App.Schema.define({
  className: 'RestRouteCompletion',
  rest: { ${routeMarker} },
  fields: () => ({}),
})
App.Schema.define({
  className: 'RestOptionCompletion',
  ${schemaMarker}
  fields: () => ({}),
})
void Post`
			const schemaPosition = markerPosition(sourceWithMarkers, schemaMarker)
			const routePosition = markerPosition(sourceWithMarkers, routeMarker)
			const hoverPosition = markerPosition(sourceWithMarkers, hoverMarker)
			const source = sourceWithMarkers
				.replace(schemaMarker, ' '.repeat(schemaMarker.length))
				.replace(routeMarker, ' '.repeat(routeMarker.length))
				.replace(hoverMarker, ' '.repeat(hoverMarker.length))
			const service = createLanguageService(fileName, source)
			const completions = (position: number): readonly string[] =>
				service
					.getCompletionsAtPosition(fileName, position, {})
					?.entries.map(({ name }) => name) ?? []
			const hover = service.getQuickInfoAtPosition(
				fileName,
				hoverPosition + hoverMarker.length,
			)

			expect(
				service
					.getSemanticDiagnostics(fileName)
					.map(({ messageText }) =>
						ts.flattenDiagnosticMessageText(messageText, ' '),
					),
			).toStrictEqual([])
			expect(completions(schemaPosition)).toContain('rest')
			expect(completions(routePosition)).toEqual(
				expect.arrayContaining(['bulk', 'count', 'find', 'get', 'mutations']),
			)
			expect(ts.displayPartsToString(hover?.displayParts)).toContain(
				'count: true',
			)
			service.dispose()
		})

		it('rejects REST options on an unrelated configured factory', () => {
			const fileName = path.join(
				import.meta.dirname,
				`rest-absent-${mode}.fixture.ts`,
			)
			const source = `import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '${moduleName}'
void restPlugin
const Other = UltimaBase.use(httpPlugin({ appId: 'unrelated' }))
Other.Schema.define({
  className: 'RestAbsentPost',
  fields: () => ({}),
  rest: { count: true },
})`
			const service = createLanguageService(fileName, source)
			const messages = service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				)
			expect(messages.some((message) => message.includes('rest'))).toBe(true)
			service.dispose()
		})

		it('rejects invalid REST route values on the configured factory', () => {
			const fileName = path.join(
				import.meta.dirname,
				`rest-invalid-${mode}.fixture.ts`,
			)
			const source = `import { UltimaBase } from '@ultimabase/core'
import { restPlugin } from '${moduleName}'
const App = UltimaBase.use(restPlugin())
App.Schema.define({
  className: 'InvalidRestPost',
  rest: { count: 'yes' },
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

	it('contributes only inert exact option declarations to Typegen', () => {
		const Post = Schema.define({
			className: 'RestTypegenPost',
			fields: (field) => ({ title: field.string() }),
		})
		const generated = generateApplicationTypes({
			ultimabase: new UltimaBase({
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
