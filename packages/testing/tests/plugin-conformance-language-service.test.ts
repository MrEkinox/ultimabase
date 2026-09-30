import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fileName = path.join(import.meta.dirname, 'plugin-conformance.fixture.ts')
const source = `
import { plugin, Schema } from '@ultimabase/core'
import {
  createPluginConformanceFixture,
  definePluginConformanceSuite,
} from '../src/index.js'

const Article = Schema.define({
  className: 'ConformanceArticle',
  fields: (field) => ({ title: field.string() }),
})
const subject = plugin({
  id: 'community.search',
  version: '1.0.0',
  core: '^1.0.0',
  contributions: [],
})
const suite = definePluginConformanceSuite({
  createFixture: () => createPluginConformanceFixture({
    subject,
    schemas: [Article],
  }),
  expected: {
    pluginId: 'community.search',
    version: '1.0.0',
    core: '^1.0.0',
  },
})

suite.check('operation', (context) => {
  const fixture = context.createUltimaBase()
  void fixture.schemas
})
`
const service = createLanguageService(fileName, source)
const packedFileName = path.join(
	import.meta.dirname,
	'plugin-conformance.packed.fixture.ts',
)
const packedSource = source.replace('../src/index.js', '@ultimabase/testing')
const packedService = createLanguageService(packedFileName, packedSource)

const quickInfo = (needle: string, offset = 0) => {
	const position = source.indexOf(needle)
	if (position < 0) throw new TypeError(`Missing fixture text: ${needle}`)
	return service.getQuickInfoAtPosition(fileName, position + offset)
}

describe('@ultimabase/testing plugin conformance language service', () => {
	it('preserves exact fixture inference and documents suite composition', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		const contextInfo = quickInfo('context.createUltimaBase', 0)
		const display = contextInfo?.displayParts?.map(({ text }) => text).join('')

		expect(display).toContain('PluginConformanceContext')
		expect(display).toContain('PluginInstance<{')
		expect(display).toContain('readonly id: "community.search"')
		expect(display).toContain('readonly [SchemaReference<"ConformanceArticle"')
		expect(
			quickInfo('suite.check', 'suite.'.length)
				?.documentation?.map(({ text }) => text)
				.join(''),
		).toContain('Adds one named domain invariant')
	})

	it('retains the same fixture inference through compiled package exports', () => {
		expect(packedService.getSemanticDiagnostics(packedFileName)).toStrictEqual(
			[],
		)
		const position = packedSource.indexOf('context.createUltimaBase')
		const display = packedService
			.getQuickInfoAtPosition(packedFileName, position)
			?.displayParts?.map(({ text }) => text)
			.join('')
		expect(display).toContain('PluginConformanceContext')
		expect(display).toContain('"community.search"')
	})
})
