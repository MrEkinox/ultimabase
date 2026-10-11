import path from 'node:path'
import { UltimaBase } from '@ultimabase/core'
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
	const User = PasswordUserSchema.define(UltimaBase.Schema, {
		className: 'User',
		fields: (field) => ({ displayName: field.string({ required: true }) }),
	})
	const generated = generateApplicationTypes({
		ultimabase: new (UltimaBase.use(passwordAuthPlugin({ user: User })))({
			schemas: [User],
			logger: false,
		}),
		applicationId: 'user-auth-editor',
	})
	const fileName = path.join(import.meta.dirname, 'user-auth-editor.virtual.ts')
	const source = `${generated.contents}
import { UltimaBase } from '@ultimabase/core'
import { PasswordUserSchema } from '${mode === 'source' ? '../src/index.js' : '@ultimabase/password-auth-plugin'}'
const AppUser = PasswordUserSchema.define(UltimaBase.Schema, { className: 'User', fields: (field) => ({ displayName: field.string({ required: true }) }) })
const credentials = { username: 'Ada', password: 'correct horse battery staple' }
AppUser./* methods */signUp({ ...credentials, displayName: 'Ada Lovelace' })
// @ts-expect-error -- The editor fixture intentionally requests completions in an unfinished input.
AppUser.signUp({ /* signup fields */ })
const result = await AppUser./* hover */login(credentials)
// @ts-expect-error -- User commands resolve the sole active application.
AppUser.login(credentials, { ultimabase: {} })
const displayName: string = result.user./* fields */displayName
const token: string = result.session.token
const users = await AppUser.findMany({ select: { displayName: true } })
const profileName: string | undefined = users[0]?.displayName
// @ts-expect-error -- Generated selected User results retain exact fields.
users[0]?.username
const currentName: string = (await AppUser.current()).displayName
const signupName: string = (await AppUser.signUp({ ...credentials, displayName: 'Ada' })).user.displayName
await AppUser.refresh(token)
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

	// This second project has no generated registry: configured builders, options,
	// and operations retain their exact contracts through source and built exports.
	const operationFile = path.join(
		import.meta.dirname,
		`user-auth-operations-${mode}.virtual.ts`,
	)
	const operationSource = `
import { UltimaBase, contributeDeclarations, defineSchemaOption, plugin } from '@ultimabase/core'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { PasswordUserSchema, passwordAuthPlugin } from '${mode === 'source' ? '../src/index.js' : '@ultimabase/password-auth-plugin'}'
const profileOptions = plugin({
  id: 'fixture.profile-options', core: '^0.0.0', version: '1.0.0',
  permissions: { 'schema:declare': 'Declares the profile option used by this source-only check.' },
  contributions: [contributeDeclarations({
    schema: ({ schemas }) => schemas.defineOptions({
      contributionId: 'profile-options',
      schema: { profile: defineSchemaOption<boolean>({
        normalize: (value): boolean => value === true,
        protocolVersion: 1, typegen: false,
      }) },
    }),
  })],
})
const Base = UltimaBase.use(pgVectorPlugin(), profileOptions)
const User = PasswordUserSchema.define(Base.Schema, {
  className: 'User',
  profile: true,
  fields: (field) => ({
    displayName: field.string({ required: true }),
    embedding: field./* configured builder */vector({ dimensions: 3 }),
  }),
})
User.signUp({ username: 'Ada', password: 'secret', displayName: 'Ada', embedding: [1, 2, 3] })
// @ts-expect-error -- Source signup inputs require the exact local profile fields.
User.signUp({ username: 'Ada', password: 'secret' })
// @ts-expect-error -- Plugin field values stay exact without generated declarations.
User.signUp({ username: 'Ada', password: 'secret', displayName: 'Ada', embedding: 'wrong' })
// @ts-expect-error -- Local plugin options retain exact source input types.
PasswordUserSchema.define(Base.Schema, { className: 'User', fields: () => ({}), profile: 'invalid' })
// @ts-expect-error -- A schema option is unavailable without its plugin.
PasswordUserSchema.define(UltimaBase.Schema, {
  className: 'User', fields: () => ({}),
  profile: true,
})
PasswordUserSchema.define(UltimaBase.Schema, {
  className: 'User',
  fields: (field) => ({
    // @ts-expect-error -- Plugin builders are absent from the earlier unconfigured factory.
    embedding: field.vector({ dimensions: 3 }),
  }),
})
const Application = UltimaBase.use(passwordAuthPlugin())
const application = new Application({ schemas: [] })
const withoutAuth = new UltimaBase({ schemas: [] })
const dynamicLogin = withoutAuth.operation('ultimabase.password-auth.login')
// @ts-expect-error -- The dynamic fallback has no typed login result without the plugin.
const dynamicToken: string = (await dynamicLogin.execute({ username: 'Ada', password: 'secret' })).session.token
const login = application.operation('ultimabase.password-auth.login')
const credentials: Parameters<typeof login.execute>[0] = {
  username: 'Ada',
  password: 'correct horse battery staple',
}
const result = await login.execute(credentials)
const token: string = result.session.token
const logout = application.operation('ultimabase.password-auth.logout')
const revoked: true = (await logout.execute(null)).revoked
// @ts-expect-error -- Installed login requires both credential fields.
const invalid: Parameters<typeof login.execute>[0] = { username: 'Ada' }
void token
void revoked
void invalid
void dynamicToken
`
	const operationService = createLanguageService(
		operationFile,
		operationSource,
		{ register: true },
	)
	try {
		expect(
			operationService
				.getSemanticDiagnostics(operationFile)
				.map((diagnostic) =>
					ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
				),
		).toEqual([])
		expect(
			operationService
				.getCompletionsAtPosition(
					operationFile,
					operationSource.indexOf('/* configured builder */') +
						'/* configured builder */'.length,
					{},
				)
				?.entries.map(({ name }) => name),
		).toContain('vector')
		const inputHover = operationService.getQuickInfoAtPosition(
			operationFile,
			operationSource.indexOf('credentials:') + 1,
		)
		expect(ts.displayPartsToString(inputHover?.displayParts)).toContain(
			'PasswordCredentialsInput',
		)
	} finally {
		operationService.dispose()
	}
}
