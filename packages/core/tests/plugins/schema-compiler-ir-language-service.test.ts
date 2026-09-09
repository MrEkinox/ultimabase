import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'schema-compiler-ir-language-service.prototype.ts',
)
const source = await readFile(fixtureFile, 'utf8')
const service = createLanguageService(fixtureFile, source)

const readHover = (
	name: string,
): Readonly<{
	readonly display: string
	readonly documentation: string
}> => {
	const marker = `/* hover:${name} */`
	const markerPosition = source.indexOf(marker)
	if (markerPosition < 0) throw new TypeError(`Missing marker: ${marker}`)
	let position = markerPosition + marker.length
	while (/\s/u.test(source[position] ?? '')) position += 1
	const quickInfo = service.getQuickInfoAtPosition(fixtureFile, position)

	return {
		display: ts.displayPartsToString(quickInfo?.displayParts),
		documentation: ts.displayPartsToString(quickInfo?.documentation),
	}
}

describe('schema compiler IR source language service', () => {
	it('exposes distinct documented presence and equality selector contracts', () => {
		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
		expect(readHover('compiler-protocol').display).toContain('"5.0.0"')
		const presence = readHover('option-presence-selector')
		expect(presence.display).toContain('SchemaOptionPresenceSelector')
		expect(presence.documentation).toContain(
			'normalized direct option is present',
		)
		expect(readHover('option-equality-selector').display).toContain(
			'SchemaOptionEqualitySelector',
		)
	})
})
