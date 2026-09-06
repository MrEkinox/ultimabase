import {
	UltimaBase,
	defineOperation,
	defineOperationValue,
	definePlugin,
	operationHandler,
	provideOperationHandler,
} from '@ultimabase/core'
import {
	PasswordUser,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPasswordCredentialCollection,
	findPasswordCredentialByUsername,
	insertPasswordCredential,
	upgradePasswordCredential,
} from '../../packages/password-auth-plugin/src/credentials.js'
import {
	createPasswordVerifier,
	verifyPassword,
} from '../../packages/password-auth-plugin/src/password-hasher.js'
import { normalizePasswordUsername } from '../../packages/password-auth-plugin/src/normalization.js'
import { resolvePasswordHashPolicy } from '../../packages/password-auth-plugin/src/password-policy.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL fixture is unavailable')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'password_identities' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const inputValue = defineOperationValue((value) => {
	if (
		!isPlainRecord(value) ||
		typeof value.action !== 'string' ||
		typeof value.password !== 'string' ||
		typeof value.userId !== 'string' ||
		typeof value.username !== 'string'
	) {
		throw new TypeError('Credential fixture input is invalid')
	}
	return immutableRecord({
		action: value.action,
		password: value.password,
		userId: value.userId,
		username: value.username,
	})
})
const resultValue = defineOperationValue((value) => {
	if (typeof value !== 'string') {
		throw new TypeError('Credential fixture result must be a string')
	}
	return value
})
const credentialOperation = defineOperation({
	input: inputValue,
	name: 'fixture.password-auth.credentials',
	result: resultValue,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const initialPolicy = resolvePasswordHashPolicy({
	memoryCostKiB: 19_456,
	parallelism: 1,
	policyVersion: 1,
	timeCost: 2,
})
const upgradedPolicy = resolvePasswordHashPolicy({
	memoryCostKiB: 19_457,
	parallelism: 1,
	policyVersion: 2,
	timeCost: 2,
})

describe('Password identities with PostgreSQL', { concurrent: false }, () => {
	it('stores only canonical public usernames and enforces uniqueness', async () => {
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
				passwordAuthPlugin(),
				restPlugin({ default: true }),
			],
			schemas: [],
		})
		await ultimabase.start()

		try {
			const rest = ultimabase.application.getPlugin('@ultimabase/rest-plugin')
			expect(rest.routeGraph.routes).not.toContainEqual(
				expect.objectContaining({ schema: 'User' }),
			)
			await expect(
				new PasswordUser({ username: 'Ada' }).create({}, { ultimabase }),
			).rejects.toThrow('canonical representation')
			const user = await new PasswordUser({ username: 'ada' }).create(
				{},
				{ ultimabase },
			)
			expect(user.username).toBe('ada')
			await expect(
				new PasswordUser({ username: 'ada' }).create({}, { ultimabase }),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('persists, verifies, upgrades, and cascades owner-private credentials', async () => {
		const credentials = createPasswordCredentialCollection(
			PasswordUser,
			upgradedPolicy,
		)
		const handler = operationHandler({
			operation: credentialOperation,
			execute: async ({ input }) => {
				const username = normalizePasswordUsername(input.username)
				switch (input.action) {
					case 'insert': {
						const verifier = await createPasswordVerifier(
							input.password,
							initialPolicy,
						)
						await insertPasswordCredential(credentials, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
							userId: input.userId,
							username,
						})
						return 'inserted'
					}
					case 'verify': {
						const credential = await findPasswordCredentialByUsername(
							credentials,
							username,
						)
						if (credential === null) return 'missing'
						const verified = await verifyPassword(
							input.password,
							{
								encoded: credential.passwordVerifier,
								policyVersion: credential.policyVersion,
							},
							upgradedPolicy,
						)
						return verified.matches
							? verified.requiresUpgrade
								? 'upgrade-required'
								: 'verified'
							: 'invalid'
					}
					case 'upgrade': {
						const current = await findPasswordCredentialByUsername(
							credentials,
							username,
						)
						if (current === null) return 'missing'
						const verifier = await createPasswordVerifier(
							input.password,
							upgradedPolicy,
						)
						return (await upgradePasswordCredential(credentials, current, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
						})) === null
							? 'conflict'
							: 'upgraded'
					}
					default:
						return 'unknown'
				}
			},
		})
		const fixturePlugin = definePlugin({
			capabilities: {
				provides: [
					provideOperationHandler({
						contributionId: 'credential-handler',
						create: () => ({ value: handler }),
					}),
				],
			},
			core: '^0.0.0',
			declare: ({ operations, privateStorage }) => {
				privateStorage.register(credentials)
				operations.declare(credentialOperation)
			},
			environment: ['environment:native-code'],
			pluginId: '@ultimabase/password-auth-credential-fixture',
			privileges: [
				{ name: 'storage:private', reason: 'Stores credential verifiers.' },
				{ name: 'operation:declare', reason: 'Declares credential fixtures.' },
			] as const,
			version: '0.0.0',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
				passwordAuthPlugin(),
				fixturePlugin,
			],
			schemas: [],
		})
		await ultimabase.start()

		try {
			const username = 'grace'
			const password = 'another correct horse battery staple'
			const user = await new PasswordUser({ username }).create(
				{},
				{ ultimabase },
			)
			const execute = (action: string, selectedPassword = password) =>
				ultimabase.operation(credentialOperation).execute({
					action,
					password: selectedPassword,
					userId: user.id,
					username,
				})

			expect(await execute('insert')).toBe('inserted')
			expect(await execute('verify')).toBe('upgrade-required')
			expect(await execute('verify', 'incorrect password value')).toBe(
				'invalid',
			)
			expect(await execute('upgrade')).toBe('upgraded')
			expect(await execute('verify')).toBe('verified')

			const privateTables = await getFixture().pool.query<{
				readonly table_name: string
			}>(
				`SELECT table_name
				 FROM information_schema.tables
				 WHERE table_schema = current_schema()
				   AND table_name LIKE '_ub_private_%'`,
			)
			let storedVerifier: string | undefined
			for (const { table_name: tableName } of privateTables.rows) {
				const stored = await getFixture().pool.query<{
					readonly passwordVerifier: string
				}>(`SELECT "passwordVerifier" FROM "${tableName}"`)
				storedVerifier ??= stored.rows[0]?.passwordVerifier
			}
			expect(storedVerifier).toMatch(/^\$argon2id\$v=19\$/u)
			expect(storedVerifier).not.toContain(password)

			await user.delete({}, { ultimabase })
			expect(await execute('verify')).toBe('missing')
		} finally {
			await ultimabase.dispose()
		}
	})
})
