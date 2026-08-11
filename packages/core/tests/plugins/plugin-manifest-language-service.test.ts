import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'plugin-manifest-language-service.prototype.ts',
)
const source = await readFile(fixtureFile, 'utf8')
const service = createLanguageService(fixtureFile, source)

const readStringCompletions = (name: string): readonly string[] => {
	const marker = `/* completion:${name} */`
	const markerPosition = source.indexOf(marker)

	if (markerPosition < 0) throw new TypeError(`Missing marker: ${marker}`)

	let position = markerPosition + marker.length
	while (/\s/u.test(source[position] ?? '')) position += 1

	return (
		service.getCompletionsAtPosition(fixtureFile, position + 1, {
			includeCompletionsWithInsertText: true,
		})?.entries ?? []
	).map(({ name: entryName }) => entryName)
}

const readHover = (name: string): string => {
	const marker = `/* hover:${name} */`
	const markerPosition = source.indexOf(marker)

	if (markerPosition < 0) throw new TypeError(`Missing marker: ${marker}`)

	let position = markerPosition + marker.length
	while (/\s/u.test(source[position] ?? '')) position += 1

	return ts.displayPartsToString(
		service.getQuickInfoAtPosition(fixtureFile, position)?.displayParts,
	)
}

describe('plugin manifest source language service', () => {
	it('offers the closed literals and preserves public manifest hovers', () => {
		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
		expect(readStringCompletions('privilege')).toEqual(
			expect.arrayContaining([
				'authority:elevate',
				'runtime:observe',
				'schema:declare',
				'typegen:replace',
			]),
		)
		expect(readStringCompletions('environment')).toStrictEqual([
			'environment:filesystem',
			'environment:native-code',
			'environment:network',
			'environment:process',
		])
		expect(readHover('privilege')).toContain('type PluginPrivilege =')
		expect(readHover('environment')).toContain('type PluginEnvironmentClaim =')
		expect(readHover('identity')).toContain('interface PluginIdentity')
		expect(readHover('manifest')).toContain('interface PluginManifest')
	})
})
