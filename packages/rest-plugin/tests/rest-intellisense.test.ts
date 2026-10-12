import path from 'node:path'
import ts from 'typescript'

import { UltimaBase } from '@ultimabase/core'
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
  fields: (field) => ({ title: field.string() }),
}).with({ rest: { ${hoverMarker}count: true } })
App.Schema.define({
  className: 'RestRouteCompletion',
  fields: () => ({}),
}).with({ rest: { ${routeMarker} } })
App.Schema.define({
  className: 'RestOptionCompletion',
  fields: () => ({}),
}).with({ ${schemaMarker} })
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
				expect.arrayContaining([
					'count',
					'createMany',
					'findMany',
					'findOne',
					'upsertOne',
				]),
			)
			// `.with({ rest })` shows the documented method (ADR-0324).
			expect(ts.displayPartsToString(hover?.displayParts)).toBe(
				'(property) RestMethodRules.count?: boolean',
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
}).with({ rest: { count: true } })`
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
  fields: () => ({}),
}).with({ rest: { count: 'yes' } })`
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

	it('contributes only inert exact option declarations to Typegen', () => {
		const App = UltimaBase.use(restPlugin())
		const Post = App.Schema.define({
			className: 'RestTypegenPost',
			fields: (field) => ({ title: field.string() }),
		})
		const generated = generateApplicationTypes({
			ultimabase: new (UltimaBase.use(restPlugin()))({
				logger: false,
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
import { UltimaBase } from '@ultimabase/core'
import { restPlugin } from '../src/index.js'
const App = UltimaBase.use(restPlugin())
App.Schema.define({
  className: 'RestCompletion',
  rest: { ${hoverMarker}count: true },
  fields: () => ({}),
})
App.Schema.define({
  className: 'RestRouteCompletion',
  rest: { ${routeMarker} },
  fields: () => ({}),
})
App.Schema.define({
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
				'count',
				'createMany',
				'createOne',
				'deleteMany',
				'deleteOne',
				'exists',
				'findMany',
				'findOne',
				'updateMany',
				'updateOne',
				'upsertMany',
				'upsertOne',
			]),
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'count: true',
		)
		expect(generated.contents).toContain('RestSchemaRule')
		expect(generated.contents).not.toContain('/api/v1/classes')
		service.dispose()
	})
})
