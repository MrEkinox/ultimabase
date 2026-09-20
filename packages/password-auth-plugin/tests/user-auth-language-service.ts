import path from 'node:path'
import { FrameworkApplication } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { generateApplicationTypes } from '@ultimabase/typegen'
import * as ts from 'typescript'
import { expect } from 'vitest'
import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

/** Checks editor behavior with real generated fields and either source or built exports. */
export const assertUserAuthLanguageService = (
	mode: 'source' | 'built',
): void => {
	const User = PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ displayName: field.string({ required: true }) }),
	})
	const generated = generateApplicationTypes({
		application: new FrameworkApplication({
			schemas: [],
			plugins: [passwordAuthPlugin({ user: User })],
			pluginPrivileges: { logger: false },
		}),
		applicationId: 'user-auth-editor',
	})
	const fileName = path.join(import.meta.dirname, 'user-auth-editor.virtual.ts')
	const source = `${generated.contents}
import { PasswordUserSchema } from '${mode === 'source' ? '../src/index.js' : '@ultimabase/password-auth-plugin'}'
import { getCurrentUltimaBase } from '@ultimabase/core'
const AppUser = PasswordUserSchema.define({ className: 'User', fields: (field) => ({ displayName: field.string({ required: true }) }) })
const credentials = { username: 'Ada', password: 'correct horse battery staple' }
AppUser./* methods */signUp({ ...credentials, displayName: 'Ada Lovelace' })
// @ts-expect-error -- The editor fixture intentionally requests completions in an unfinished input.
AppUser.signUp({ /* signup fields */ })
const result = await AppUser./* hover */login(credentials)
const displayName: string = result.user./* fields */displayName
const token: string = result.session.token
await AppUser.refresh(token, { ultimabase: getCurrentUltimaBase() })
const logout = await AppUser.logout(token)
const revoked: true = logout.revoked
`
	const service = createLanguageService(
		fileName,
		source.replace(
			'/* signup fields */',
			' '.repeat('/* signup fields */'.length),
		),
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
			['/* methods */', ['signUp', 'login', 'refresh', 'logout']],
			['/* fields */', ['id', 'username', 'displayName']],
			['/* signup fields */', ['displayName', 'username', 'password']],
		] as const) {
			const names = service
				.getCompletionsAtPosition(fileName, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
			expect(names).toEqual(expect.arrayContaining([...expected]))
		}
		const hover = service.getQuickInfoAtPosition(
			fileName,
			source.indexOf('/* hover */') + '/* hover */'.length,
		)
		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'PasswordAuthenticationResult',
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'independent session',
		)
		expect(hover?.tags?.some(({ name }) => name === 'example')).toBe(true)
	} finally {
		service.dispose()
	}
}
