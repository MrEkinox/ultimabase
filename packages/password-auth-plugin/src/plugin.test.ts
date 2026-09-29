import { Schema, stringField, UltimaBase } from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/typegen'
import { describe, expect, it } from 'vitest'

import { passwordAuthPlugin } from './plugin.js'
import { PasswordUser, PasswordUserSchema } from './user-schema.js'

describe('passwordAuthPlugin identity declaration', () => {
	it('does not expose Password Auth operation names without the plugin', () => {
		const application = new UltimaBase({ schemas: [] })
		expect(() =>
			application.operation('ultimabase.password-auth.login'),
		).toThrow('Unknown application operation: ultimabase.password-auth.login')
	})

	it('contributes the default User and private credential fingerprint', () => {
		const plugin = passwordAuthPlugin()
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [],
		}).compile()

		expect(application.schemas.get('User')).toBe(PasswordUser)
		expect(PasswordUser.fields.username).toMatchObject({
			kind: 'string',
			options: { immutable: true, indexed: 'unique', required: true },
		})
		expect(PasswordUser.indexes).toContainEqual({
			fields: ['username'],
			unique: true,
		})
		expect(PasswordUser.provenance.schema.owner).toMatchObject({
			kind: 'plugin',
			pluginId: '@ultimabase/password-auth-plugin',
		})
		expect(application.privateStorageFingerprint).toMatch(/^[a-f0-9]{64}$/u)
		expect(plugin.manifest).toMatchObject({
			environment: ['environment:native-code'],
			identity: { pluginId: '@ultimabase/password-auth-plugin' },
			privileges: [
				{ name: 'schema:declare' },
				{ name: 'storage:private' },
				{ name: 'operation:declare' },
				{ name: 'transport:expose' },
				{ name: 'typegen:reference' },
				{ name: 'authority:elevate' },
				{ name: 'runtime:intercept' },
			],
		})
	})

	it('contributes one exact custom User without mutating the default', () => {
		const AppUser = PasswordUserSchema.define({
			className: 'User',
			fields: (field) => ({ displayName: field.string({ required: true }) }),
			indexes: [{ fields: ['displayName', 'username'] }],
		})
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [passwordAuthPlugin({ user: AppUser })],
			schemas: [AppUser],
		}).compile()

		expect(application.schemas.get('User')).toBe(AppUser)
		expect(AppUser.fields).toHaveProperty('displayName')
		expect(AppUser.fields).toHaveProperty('username')
		expect(AppUser.indexes).toContainEqual({
			fields: ['displayName', 'username'],
			unique: false,
		})
		expect(PasswordUser.fields).not.toHaveProperty('displayName')
		expect(AppUser.provenance.schema.owner).toMatchObject({
			kind: 'plugin',
			pluginId: '@ultimabase/password-auth-plugin',
		})
	})

	it('requires a custom User in the application schema list', () => {
		const AppUser = PasswordUserSchema.define({
			className: 'User',
			fields: (field) => ({ displayName: field.string() }),
		})
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [passwordAuthPlugin({ user: AppUser })],
			schemas: [],
		})

		expect(() => application.compile()).toThrow(
			'Claimed schema must be registered in application schemas: User',
		)
	})

	it('rejects arbitrary User schemas and reserved custom fields', () => {
		const ForeignUser = Schema.define({
			className: 'User',
			fields: () => ({}),
		})
		expect(() => passwordAuthPlugin({ user: ForeignUser as never })).toThrow(
			'PasswordUserSchema.define()',
		)
		expect(() =>
			PasswordUserSchema.define({
				className: 'Account',
				fields: () => ({}),
			} as never),
		).toThrow('className must be User')

		const dynamicFields: Record<string, ReturnType<typeof stringField>> = {
			passwordHash: stringField(),
		}
		expect(() =>
			PasswordUserSchema.define({
				className: 'User',
				fields: () => dynamicFields,
			}),
		).toThrow(
			expect.objectContaining({
				cause: new TypeError('Reserved Password User field: passwordHash'),
			}),
		)
	})

	it('keeps credentials absent from Typegen and from zero-consumer apps', () => {
		const withAuth = generateApplicationTypes({
			ultimabase: new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [passwordAuthPlugin()],
				schemas: [],
			}),
			applicationId: 'password-auth',
		})
		const withoutAuth = generateApplicationTypes({
			ultimabase: new UltimaBase({ plugins: [], schemas: [] }),
			applicationId: 'without-password-auth',
		})

		expect(withAuth.snapshot.schemas.map(({ className }) => className)).toEqual(
			['User'],
		)
		expect(withAuth.contents).toContain('username')
		expect(withAuth.contents).toContain('PasswordCredentialsInput')
		expect(withAuth.contents).toContain('PasswordAuthenticationResult')
		expect(withAuth.contents).toContain('ultimabase.password-auth.sign-up')
		for (const secretName of [
			'credentials',
			'passwordVerifier',
			'policyVersion',
			'sessionGeneration',
			'sessions',
			'tokenDigest',
			'revokedAt',
		]) {
			expect(withAuth.contents).not.toContain(secretName)
		}
		expect(withoutAuth.snapshot.schemas).toStrictEqual([])
		expect(withoutAuth.snapshot.privateStorageFingerprint).toBeUndefined()
	})

	it('validates plugin options and relies on Core duplicate-owner rejection', () => {
		expect(() => passwordAuthPlugin(null as never)).toThrow('plain object')
		expect(() => passwordAuthPlugin({ unknown: true } as never)).toThrow(
			'unknown option: unknown',
		)
		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [passwordAuthPlugin(), passwordAuthPlugin()],
					schemas: [],
				}),
		).toThrow()
	})

	it('requires an HTTP peer only when secure-cookie mode is configured', () => {
		expect(passwordAuthPlugin().peers).toStrictEqual([])
		const cookiePlugin = passwordAuthPlugin({
			http: { cookie: { name: '__Host-session' } },
		})
		expect(cookiePlugin.peers).toStrictEqual([
			{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
		])
		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [cookiePlugin],
					schemas: [],
				}),
		).toThrow()
	})
})
