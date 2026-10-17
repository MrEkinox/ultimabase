import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageServiceFixture } from '../../tooling/vitest/typescript-language-service.js'

// ADR-0340: the User schema of `authPlugin` types the request principal from
// the built packages, with `Register` naming only the application. A manual
// `principal` key still wins, and an application without a principal schema
// keeps `PointerValue`.
const application = (
	plugins: string,
	user: string,
	register: string,
): string => `
import { accessPlugin } from '@ultimabase/access-plugin'
${
	plugins.includes('authPlugin')
		? `import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'`
		: ''
}
import { UltimaBase, getRequestPrincipal } from '@ultimabase/core'
import { RequestContext } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'

const App = UltimaBase.use(${plugins})

export const Member = ${user}

export const Note = App.Schema.define({
  className: 'Note',
  fields: (field) => ({ body: field.string({ required: true }) }),
}).with({
  access: {
    read: ({ /* hover:access */principal }) => principal !== undefined,
  },
})

export const ultimabase = new App({ schemas: [Member, Note] })

declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof ultimabase
${register}
  }
}

export const /* hover:request */principal = await getRequestPrincipal(
  RequestContext.anonymous({ requestId: 'hover', source: 'internal' }),
)
export const /* hover:schema */schemaName = principal?.toJSON().className
const t = await testApplication(ultimabase)
// The signature prints the \`Principal\` alias as declared; its parameter type
// is the resolved pointer.
export type /* hover:as */AsPrincipal = Parameters<typeof t.as>[0]
`

const userSchema = `App.UserSchema.define({
  className: 'Member',
  fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({ access: { read: true } })`
const plainSchema = `App.Schema.define({
  className: 'Member',
  fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({ access: { read: true } })`
const withAuth = `accessPlugin(), authPlugin({ methods: [password({ identifier: 'email' })] })`

const cases = [
	{
		name: 'types the principal as the User schema of authPlugin',
		file: 'principal-user-schema.fixture.ts',
		source: application(withAuth, userSchema, ''),
		// The deferred pointer prints its alias; its members name the User.
		principal: 'PrincipalPointer',
		className: '"Member"',
	},
	{
		name: 'lets the Register principal key win over the User schema',
		file: 'principal-user-schema-key.fixture.ts',
		source: application(withAuth, userSchema, "    readonly principal: 'Note'"),
		principal: 'Pointer<"Note">',
		className: '"Note"',
	},
	{
		name: 'keeps PointerValue without a principal schema',
		file: 'principal-user-schema-none.fixture.ts',
		source: application('accessPlugin()', plainSchema, ''),
		principal: 'PointerValue',
		className: 'string',
	},
] as const

describe('Principal derived from the User schema (ADR-0340)', () => {
	it.each(cases)(
		'$name',
		({ file, source, principal, className }) => {
			const fixtureFile = path.join(import.meta.dirname, file)
			const markers = [
				'/* hover:access */',
				'/* hover:request */',
				'/* hover:as */',
				'/* hover:schema */',
			] as const
			const fixture = createLanguageServiceFixture(fixtureFile, source, markers)
			const hover = (marker: string): string =>
				ts.displayPartsToString(
					fixture.service.getQuickInfoAtPosition(
						fixtureFile,
						fixture.positionOf(marker) + marker.length,
					)?.displayParts,
				)

			expect(
				fixture.service
					.getSemanticDiagnostics(fixtureFile)
					.map(({ messageText }) =>
						ts.flattenDiagnosticMessageText(messageText, '\n'),
					),
			).toStrictEqual([])
			expect(hover('/* hover:access */')).toBe(
				`(parameter) principal: ${principal} | undefined`,
			)
			expect(hover('/* hover:request */')).toBe(
				`const principal: ${principal} | undefined`,
			)
			expect(hover('/* hover:as */')).toBe(
				`type AsPrincipal = ${principal} | undefined`,
			)
			expect(hover('/* hover:schema */')).toBe(
				`const schemaName: ${className} | undefined`,
			)
		},
		120_000,
	)
})
