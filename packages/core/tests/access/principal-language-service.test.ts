import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceFixture } from '../../../../tooling/vitest/typescript-language-service.js'

// ADR-0304: through `Register`, the principal is typed by name, from source.
const fixtureFile = path.join(import.meta.dirname, 'principal-hover.fixture.ts')
const source = `
import {
	UltimaBase,
	getRequestPrincipal,
	type Principal,
} from '../../src/index.js'
import { RequestContext } from '../../src/plugin.js'

const TodoUser = UltimaBase.Schema.define({
  className: 'TodoUser',
  fields: (field) => ({ name: field.string() }),
})
export const ultimabase = new UltimaBase({ schemas: [TodoUser] })

declare module '../../src/index.js' {
  interface Register {
    readonly app: typeof ultimabase
    readonly principal: 'TodoUser'
  }
}

export const /* hover:principal */principal: Principal | undefined = await getRequestPrincipal(
  RequestContext.anonymous({ requestId: 'hover', source: 'internal' }),
)
export const /* hover:schema */schemaName = principal?.schema.className
`

describe('Principal editor types (ADR-0304)', () => {
	const fixture = createLanguageServiceFixture(fixtureFile, source, [
		'/* hover:principal */',
		'/* hover:schema */',
	])
	const hover = (marker: string): string =>
		ts.displayPartsToString(
			fixture.service.getQuickInfoAtPosition(
				fixtureFile,
				fixture.positionOf(marker) + marker.length,
			)?.displayParts,
		)

	it('prints the registered identity schema by name', () => {
		expect(
			fixture.service
				.getSemanticDiagnostics(fixtureFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
		expect(hover('/* hover:principal */')).toBe(
			'const principal: Pointer<"TodoUser"> | undefined',
		)
		expect(hover('/* hover:schema */')).toBe(
			'const schemaName: "TodoUser" | undefined',
		)
	})
})
