import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const optionsMarker = '/* typegen-options */'
const hoverMarker = '/* typegen-hover */'
const pluginOptionsMarker = '/* typegen-plugin-options */'
const pluginHoverMarker = '/* typegen-plugin-hover */'
const sourceWithMarkers = `
import { typegenPlugin, generateApplicationTypes } from './index.js'
import type { GenerateApplicationTypesOptions } from './index.js'
import type { FrameworkApplication, PluginDefinition, SchemaDefinition } from '@ultimabase/core'

declare const application: FrameworkApplication<readonly SchemaDefinition[], readonly PluginDefinition[]>

// @ts-expect-error -- The intentionally incomplete object drives option completion.
const completionOptions: GenerateApplicationTypesOptions = {
  ${optionsMarker}
  application,
}
const generated = ${hoverMarker}generateApplicationTypes({
  application,
  applicationId: 'main',
})
const plugin = ${pluginHoverMarker}typegenPlugin({
  ${pluginOptionsMarker}
})

void completionOptions
void generated
void plugin
`
const optionsPosition = sourceWithMarkers.indexOf(optionsMarker)
const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
const pluginOptionsPosition = sourceWithMarkers.indexOf(pluginOptionsMarker)
const pluginHoverPosition = sourceWithMarkers.indexOf(pluginHoverMarker)
const source = sourceWithMarkers
	.replace(optionsMarker, ' '.repeat(optionsMarker.length))
	.replace(hoverMarker, ' '.repeat(hoverMarker.length))
	.replace(pluginOptionsMarker, ' '.repeat(pluginOptionsMarker.length))
	.replace(pluginHoverMarker, ' '.repeat(pluginHoverMarker.length))
const fileName = path.join(
	import.meta.dirname,
	'typegen-public-api.source.fixture.ts',
)
const service = createLanguageService(fileName, source)

describe('@ultimabase/typegen source declarations', () => {
	it('documents exact generator options and result hovers', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])

		const completions = service.getCompletionsAtPosition(
			fileName,
			optionsPosition,
			{},
		)
		const applicationId = completions?.entries.find(
			({ name }) => name === 'applicationId',
		)

		if (applicationId === undefined) {
			throw new TypeError('Missing applicationId completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			optionsPosition,
			applicationId.name,
			undefined,
			applicationId.source,
			undefined,
			applicationId.data,
		)
		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)

		expect(ts.displayPartsToString(details?.documentation)).toContain(
			'Isolates fingerprints',
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'GeneratedApplicationTypes',
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'deterministic, callback-free',
		)
	})

	it('documents automatic startup generation and its output options', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])

		const completions = service.getCompletionsAtPosition(
			fileName,
			pluginOptionsPosition,
			{},
		)
		const outputPath = completions?.entries.find(
			({ name }) => name === 'outputPath',
		)

		if (outputPath === undefined) {
			throw new TypeError('Missing outputPath completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			pluginOptionsPosition,
			outputPath.name,
			undefined,
			outputPath.source,
			undefined,
			outputPath.data,
		)
		const hover = service.getQuickInfoAtPosition(
			fileName,
			pluginHoverPosition + pluginHoverMarker.length,
		)

		expect(ts.displayPartsToString(details?.documentation)).toContain(
			'declaration replaced atomically',
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'TypegenPlugin',
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'before infrastructure starts',
		)
	})
})
