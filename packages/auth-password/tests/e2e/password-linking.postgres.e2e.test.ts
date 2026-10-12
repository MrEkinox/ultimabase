import {
	authenticationResult,
	authPlugin,
	defineAuthMethod,
	type AuthenticationResult,
	type AuthMethodStaticsHKT,
} from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { waitForAfterCommit } from '@ultimabase/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { password } from '../../src/index.js'
import { createOutbox, fastPolicy, secret } from './password-fixture.js'

let fixture: PostgresWorkerFixture | undefined
const pool = () => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_pw_linking' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

interface ProviderAccount {
	readonly email: string
	readonly providerUserId: string
}

/** Signs in through a provider that vouches for a verified email. */
const providerSignIn: PluginOperationDefinition<
	'fixture.auth.provider.sign-in',
	'1.0.0',
	'application',
	ProviderAccount,
	AuthenticationResult,
	readonly []
> = defineOperation({
	errors: [],
	input: defineOperationValue<ProviderAccount>((value, path) => {
		if (
			!isPlainRecord(value) ||
			typeof value.email !== 'string' ||
			typeof value.providerUserId !== 'string'
		) {
			throw new TypeError(`${path} must be a provider account`)
		}
		return immutableRecord({
			email: value.email,
			providerUserId: value.providerUserId,
		})
	}),
	name: 'fixture.auth.provider.sign-in',
	result: authenticationResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

const providerMethod = () =>
	defineAuthMethod<
		'provider',
		Readonly<Record<never, never>>,
		AuthMethodStaticsHKT,
		typeof providerSignIn
	>({
		name: 'provider',
		contributions: (services) => [
			contributeOperation({
				operation: providerSignIn,
				execute: ({ context, input }) =>
					services.authenticateAccount({
						account: {
							email: input.email,
							emailVerified: true,
							method: 'provider',
							providerUserId: input.providerUserId,
						},
						context,
						createUser: () =>
							services.createUser({ displayName: 'Provider user' }, context, {
								email: `${input.providerUserId}@provider.test`,
							}),
					}),
			}),
		],
	})

describe('verified-email linking with passwords', { concurrent: false }, () => {
	it('links a provider account only once the password email is verified', async () => {
		const outbox = createOutbox()
		const App = UltimaBase.use(
			postgresPlugin({ pool: pool(), schemaPolicy: 'override' }),
			authPlugin({
				methods: [
					password({
						identifier: 'email',
						policy: fastPolicy,
						...outbox.flows,
					}),
					providerMethod(),
				],
			}),
		)
		const LinkedUser = App.UserSchema.define({
			className: 'PasswordLinkedUser',
			fields: (field) => ({ displayName: field.string({ required: true }) }),
		}).with({})
		const ultimabase = new App({ logger: false, schemas: [LinkedUser] })
		const providerLogin = (providerUserId: string, email: string) =>
			ultimabase.operation(providerSignIn).execute({ email, providerUserId })
		await ultimabase.start()
		try {
			const unverified = await LinkedUser.signUp({
				displayName: 'Bob',
				email: 'bob@example.test',
				password: secret,
			})
			const separate = await providerLogin('github-bob', 'bob@example.test')
			expect(separate.user.id).not.toBe(unverified.user.id)

			const ada = await LinkedUser.signUp({
				displayName: 'Ada',
				email: 'ada@example.test',
				password: secret,
			})
			await waitForAfterCommit()
			await LinkedUser.verifyEmail({
				token: outbox.tokenFor('verification', 'ada@example.test'),
			})
			const linked = await providerLogin('google-ada', 'ada@example.test')
			expect(linked.user.id).toBe(ada.user.id)
			const { methods } = await ultimabase
				.plugin(authPlugin)
				.runWithSession(ada.session.token, () => LinkedUser.listMethods())
			expect(
				methods.map(({ emailVerified, method }) => [method, emailVerified]),
			).toStrictEqual([
				['password', true],
				['provider', true],
			])
		} finally {
			await ultimabase.dispose()
		}
	})
})
