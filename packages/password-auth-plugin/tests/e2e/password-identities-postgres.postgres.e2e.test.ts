import { UltimaBase } from '@ultimabase/core'
import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	contributeDeclarations,
} from '@ultimabase/core/plugin'
import {
	PasswordUser,
	PasswordUserSchema,
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
} from '../../src/credentials.js'
import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from '../../src/password-hasher.js'
import {
	normalizePasswordInput,
	normalizePasswordUsername,
} from '../../src/normalization.js'
import { resolvePasswordHashPolicy } from '../../src/password-policy.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

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
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			passwordAuthPlugin(),
			restPlugin({ default: true }),
		))({
			logger: false,
			schemas: [],
		})
		await ultimabase.start()

		try {
			const rest = ultimabase.plugin('@ultimabase/rest-plugin')
			expect(rest.routeGraph.routes).not.toContainEqual(
				expect.objectContaining({ schema: 'User' }),
			)
			await expect(
				PasswordUser.createOne({ data: { username: 'Ada' } }),
			).rejects.toThrow('canonical representation')
			const user = await PasswordUser.createOne({ data: { username: 'ada' } })
			expect(user.username).toBe('ada')
			await expect(
				PasswordUser.createOne({ data: { username: 'ada' } }),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				publicDetails: { fields: ['username'], schema: 'User' },
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('preserves canonical usernames across atomic creates and upserts', async () => {
		// This custom User requires a fresh schema, separate from the default User fixture.
		await using isolated = await createPostgresWorkerFixture({
			prefix: 'password_batches',
		})
		const User = PasswordUserSchema.define({
			className: 'User',
			fields: (field) => ({ displayName: field.string({ required: true }) }),
		})
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: isolated.pool, schemaPolicy: 'override' }),
			passwordAuthPlugin({ user: User }),
		))({
			logger: false,
			schemas: [User],
		})
		try {
			await ultimabase.start()
			await expect(
				User.createMany({
					data: [
						{ username: 'grace', displayName: 'Grace' },
						{ username: 'Ada', displayName: 'Ada' },
					],
				}),
			).rejects.toThrow('canonical representation')
			// A later invalid item must roll back the earlier valid identity.
			expect(await User.count({})).toBe(0)
			const input = {
				where: { username: { eq: 'ada' } },
				create: { username: 'ada', displayName: 'Ada' },
				update: { displayName: 'Ada Lovelace' },
			}
			const created = await User.upsertOne(input)
			const updated = await User.upsertMany({ data: [input] })
			expect(updated[0]?.id).toBe(created.id)
			expect(updated[0]?.displayName).toBe('Ada Lovelace')
			await expect(
				User.upsertOne({
					where: { username: { eq: 'Grace' } },
					create: { username: 'Grace', displayName: 'Grace' },
					update: { displayName: 'Grace Hopper' },
				}),
			).rejects.toThrow('canonical representation')
			expect(await User.count({})).toBe(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('persists, verifies, upgrades, and cascades owner-private credentials', async () => {
		const credentials = createPasswordCredentialCollection(
			PasswordUser,
			upgradedPolicy,
		)
		const credentialContribution = contributeOperation({
			operation: credentialOperation,
			execute: async ({ input }) => {
				const username = normalizePasswordUsername(input.username)
				switch (input.action) {
					case 'insert': {
						const verifier = await createNormalizedPasswordVerifier(
							normalizePasswordInput(input.password),
							initialPolicy,
						)
						await insertPasswordCredential(credentials, {
							passwordVerifier: verifier.encoded,
							policyVersion: verifier.policyVersion,
							sessionGeneration: 0,
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
						const verified = await verifyNormalizedPasswordOrDummy(
							normalizePasswordInput(input.password),
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
						const verifier = await createNormalizedPasswordVerifier(
							normalizePasswordInput(input.password),
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
		const fixturePlugin = plugin({
			core: '^0.0.0',
			environment: ['environment:native-code'],
			id: '@ultimabase/password-auth-credential-fixture',
			permissions: {
				'storage:private': 'Stores credential verifiers.',
				'operation:declare': 'Declares credential fixtures.',
			},
			version: '0.0.0',
			contributions: [
				credentialContribution,
				contributeDeclarations({
					privateStorage: ({ privateStorage }) => {
						privateStorage.register(credentials)

						return undefined
					},
				}),
			],
		})
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			passwordAuthPlugin(),
			fixturePlugin,
		))({ logger: false, schemas: [] })
		await ultimabase.start()

		try {
			const username = 'grace'
			const password = 'another correct horse battery staple'
			const user = await PasswordUser.createOne({ data: { username } })
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
				 FROM information_schema.columns
				 WHERE table_schema = current_schema()
				   AND table_name LIKE '_ub_private_%'
				   AND column_name = 'password_verifier'`,
			)
			let storedVerifier: string | undefined
			for (const { table_name: tableName } of privateTables.rows) {
				const stored = await getFixture().pool.query<{
					readonly passwordVerifier: string
				}>(`SELECT password_verifier AS "passwordVerifier" FROM "${tableName}"`)
				storedVerifier ??= stored.rows[0]?.passwordVerifier
			}
			expect(storedVerifier).toMatch(/^\$argon2id\$v=19\$/u)
			expect(storedVerifier).not.toContain(password)

			await PasswordUser.deleteOne({ where: { id: { eq: user.id } } })
			expect(await execute('verify')).toBe('missing')
		} finally {
			await ultimabase.dispose()
		}
	})
})
