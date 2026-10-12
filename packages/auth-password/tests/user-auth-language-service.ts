import path from 'node:path'

import * as ts from 'typescript'
import { expect } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const signUpMarker = '/* signup fields */'
const optionsMarker = '/* options */'

/** Checks editor behavior of `App.UserSchema` through source or built exports. */
export const assertUserAuthLanguageService = (
	mode: 'built' | 'source',
): void => {
	const fileName = path.join(
		import.meta.dirname,
		`user-auth-editor-${mode}.virtual.ts`,
	)
	const source = `
import { UltimaBase } from '@ultimabase/core'
import { authPlugin } from '@ultimabase/auth-plugin'
import { password } from '${mode === 'source' ? '../src/index.js' : '@ultimabase/auth-password'}'
const App = UltimaBase.use(authPlugin({ methods: [password({ identifier: 'email' })] }))
const AppUser = App.UserSchema.define({
  className: 'EditorUser',
  fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({})
const credentials = { email: 'ada@example.test', password: 'correct horse battery staple' }
AppUser./* methods */signUp({ ...credentials, displayName: 'Ada Lovelace' })
// @ts-expect-error -- The editor fixture requests completions in an unfinished input.
AppUser.signUp({ ${signUpMarker} })
const result = await AppUser./* hover */login(credentials)
const displayName: string = result.user./* fields */displayName
const token: string = result.session.token
const currentName: string = (await AppUser.current()).displayName
await AppUser.refresh(token)
const revoked: true = (await AppUser.logout(token)).revoked
// @ts-expect-error -- The editor fixture requests completions in unfinished options.
App.UserSchema.define({ ${optionsMarker} })
void displayName
void currentName
void revoked
`
	const blank = (text: string, marker: string) =>
		text.replace(marker, ' '.repeat(marker.length))
	const service = createLanguageService(
		fileName,
		blank(blank(source, signUpMarker), optionsMarker),
	)
	try {
		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map((diagnostic) =>
					ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
				),
		).toEqual([])
		for (const [marker, expected] of [
			[
				'/* methods */',
				[
					'signUp',
					'login',
					'current',
					'refresh',
					'logout',
					'logoutEverywhere',
					'listSessions',
					'changePassword',
					'reauthenticate',
					'deleteAccount',
				],
			],
			['/* fields */', ['id', 'email', 'displayName']],
			[signUpMarker, ['displayName', 'email', 'password']],
			[optionsMarker, ['className', 'fields']],
		] as const) {
			const names = service
				.getCompletionsAtPosition(fileName, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
			expect(names, marker).toEqual(expect.arrayContaining([...expected]))
		}
		const hover = service.getQuickInfoAtPosition(
			fileName,
			source.indexOf('/* hover */') + '/* hover */'.length,
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'AuthenticationResult',
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'returns the readable User and a new session',
		)
		expect(hover?.tags?.some(({ name }) => name === 'example')).toBe(true)
	} finally {
		service.dispose()
	}
}
