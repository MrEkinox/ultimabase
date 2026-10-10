import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceFixture } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0304: Access rules, Hooks contexts and ACL callbacks print the
// principal by name from the built packages once `Register` names it.
const fixtureFile = path.join(import.meta.dirname, 'principal-hover.fixture.ts')
const source = `
import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin())

export const TodoUser = App.Schema.define({
  className: 'TodoUser',
  fields: (field) => ({ name: field.string() }),
}).with({ access: { read: true } })

export const Todo = App.Schema.define({
  className: 'Todo',
  fields: (field) => ({ title: field.string({ required: true }) }),
})
  .acl()
  .with({
    access: {
      create: isAuthenticated,
      update: ({ /* hover:access */principal }) => principal !== undefined,
    },
    acl: { default: ({ /* hover:acl */principal }) => new ACL(principal) },
    hooks: {
      beforeOperation: {
        create: ({ context }) => {
          void context./* hover:hooks */principal
        },
      },
    },
  })

export const ultimabase = new App({ schemas: [TodoUser, Todo] })

declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof ultimabase
    readonly principal: 'TodoUser'
  }
}
`

describe('Principal editor types from built packages (ADR-0304)', () => {
	const markers = [
		'/* hover:access */',
		'/* hover:acl */',
		'/* hover:hooks */',
	] as const
	const fixture = createLanguageServiceFixture(fixtureFile, source, markers)
	const hover = (marker: string): string =>
		ts.displayPartsToString(
			fixture.service.getQuickInfoAtPosition(
				fixtureFile,
				fixture.positionOf(marker) + marker.length,
			)?.displayParts,
		)

	it('prints Pointer<"TodoUser"> in rules, ACL callbacks and Hooks', () => {
		expect(
			fixture.service
				.getSemanticDiagnostics(fixtureFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
		expect(hover('/* hover:access */')).toBe(
			'(parameter) principal: Pointer<"TodoUser"> | undefined',
		)
		expect(hover('/* hover:acl */')).toBe(
			'(parameter) principal: Pointer<"TodoUser"> | undefined',
		)
		expect(hover('/* hover:hooks */')).toBe(
			'(property) HookContext.principal: Pointer<"TodoUser"> | undefined',
		)
	}, 60_000)
})
