import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'
import {
	expectCanonicalQueryTypeHovers,
	publicQueryTypeHoverCases,
} from './public-query-type-expectations.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'public-query-types.prototype.ts',
)
const source = await readFile(fixtureFile, 'utf8')
const service = createLanguageService(fixtureFile, source)

it('exports only the canonical Query type names from source', () => {
	expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
	expectCanonicalQueryTypeHovers((marker) => {
		const sourceMarker = `/* hover:${marker} */`
		const markerPosition = source.indexOf(sourceMarker)

		if (markerPosition < 0) {
			throw new TypeError(`Missing public Query type marker: ${sourceMarker}`)
		}

		let position = markerPosition + sourceMarker.length

		while (/\s/u.test(source[position] ?? '')) {
			position += 1
		}

		const quickInfo = service.getQuickInfoAtPosition(fixtureFile, position)

		return ts.displayPartsToString(quickInfo?.displayParts)
	})
	expect(publicQueryTypeHoverCases).toHaveLength(3)
})
