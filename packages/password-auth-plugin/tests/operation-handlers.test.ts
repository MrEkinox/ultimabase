import {
	FrameworkError,
	MasterAuthority,
	RequestContext,
	UltimaBase,
	plugin,
	runWithRequestEngine,
	withPluginPrivileges,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import {
	DeterministicDatabaseAdapter,
	deterministicDatabasePlugin,
} from '../../../tests/performance/fixtures/deterministic-database.js'
import * as credentials from '../src/credentials.js'
import { createPasswordOperationHandlers } from '../src/operation-handlers.js'
import { passwordAuthOperations } from '../src/operations.js'
import { defaultPasswordHashPolicy } from '../src/password-policy.js'
import { createPasswordPrincipal } from '../src/principal.js'
import {
	createPasswordSession,
	passwordPrincipal,
	passwordSession,
} from '../src/session.js'
import { defaultPasswordSessionPolicy } from '../src/session-policy.js'
import * as sessions from '../src/sessions.js'
import { PasswordUser } from '../src/user-schema.js'

describe('Password Auth refresh concurrency', () => {
	it('rejects a generation invalidated after its read without rotating the session', async () => {
		const credential = {
			passwordVerifier: 'fixture-verifier',
			policyVersion: 1,
			sessionGeneration: 0,
			userId: '0198c000-0000-7000-8000-000000000001',
			username: 'concurrent-refresh',
		}
		const lookup = vi
			.spyOn(credentials, 'findPasswordCredentialByUserId')
			.mockResolvedValue(credential)
		// Force the lost compare-and-swap rather than relying on PostgreSQL scheduling.
		const retain = vi
			.spyOn(credentials, 'retainPasswordSessionGeneration')
			.mockResolvedValue(null)
		const rotate = vi.spyOn(sessions, 'rotatePasswordSession')
		try {
			const [, , , , , refresh] = createPasswordOperationHandlers({
				credentials: credentials.createPasswordCredentialCollection(
					PasswordUser,
					defaultPasswordHashPolicy,
				),
				passwordPolicy: defaultPasswordHashPolicy,
				sessionPolicy: defaultPasswordSessionPolicy,
				sessions: sessions.createPasswordSessionCollection(
					PasswordUser,
					defaultPasswordSessionPolicy,
				),
				user: PasswordUser,
			})
			const adapter = new DeterministicDatabaseAdapter()
			const App = UltimaBase.use(
				deterministicDatabasePlugin(adapter),
				plugin({
					core: '^0.0.0',
					id: 'fixture.password-refresh',
					version: '0.0.0',
					permissions: {
						'operation:declare': 'Tests the refresh handler.',
						'typegen:reference': 'Retains the operation result contract.',
					},
					contributions: [refresh],
				}),
			)
			await using app = new App({
				pluginPrivileges: { logger: false },
				schemas: [PasswordUser],
			})
			await app.start()
			const context = RequestContext.anonymous({
				requestId: 'refresh-lost-generation',
				source: 'fixture',
			})
				.withValue(
					passwordPrincipal,
					createPasswordPrincipal(PasswordUser.pointer(credential.userId)),
				)
				.withValue(
					passwordSession,
					createPasswordSession(
						{
							absoluteExpiresAt: '2027-01-01T00:00:00.000Z',
							createdAt: '2026-10-01T00:00:00.000Z',
							expiresAt: '2027-01-01T00:00:00.000Z',
							id: '0198c000-0000-7000-8000-000000000002',
							rotationVersion: 0,
						},
						0,
					),
				)
			await expect(
				runWithRequestEngine(app.withContext(context), () =>
					app.operation(passwordAuthOperations.refresh).execute(null),
				),
			).rejects.toMatchObject({ code: 'PASSWORD_AUTH_INVALID_SESSION' })
			expect(lookup).toHaveBeenCalledWith(expect.anything(), credential.userId)
			expect(retain).toHaveBeenCalledWith(expect.anything(), credential)
			expect(rotate).not.toHaveBeenCalled()
			expect(adapter.snapshot()).toMatchObject({ commits: 0, transactions: 1 })
		} finally {
			lookup.mockRestore()
			retain.mockRestore()
			rotate.mockRestore()
		}
	})
})

/** Fails every prepared write with one neutral storage error, as any adapter would. */
class FailingWriteDatabaseAdapter extends DeterministicDatabaseAdapter {
	readonly #failure: FrameworkError

	constructor(failure: FrameworkError) {
		super()
		this.#failure = failure
	}

	override async beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = await super.beginTransaction()
		const failure = this.#failure
		return Object.freeze({
			kind: transaction.kind,
			capabilities: transaction.capabilities,
			execute: transaction.execute.bind(transaction),
			commit: transaction.commit.bind(transaction),
			rollback: transaction.rollback.bind(transaction),
			prepare: () =>
				Promise.resolve({
					execute: () => Promise.reject(failure),
				} as unknown as PreparedDatabaseOperation<never>),
		}) as DatabaseTransactionAdapter
	}
}

describe('Password Auth sign-up duplicates', () => {
	const signUpWith = async (failure: FrameworkError): Promise<unknown> => {
		const [signUp] = createPasswordOperationHandlers({
			credentials: credentials.createPasswordCredentialCollection(
				PasswordUser,
				defaultPasswordHashPolicy,
			),
			passwordPolicy: defaultPasswordHashPolicy,
			sessionPolicy: defaultPasswordSessionPolicy,
			sessions: sessions.createPasswordSessionCollection(
				PasswordUser,
				defaultPasswordSessionPolicy,
			),
			user: PasswordUser,
		})
		const App = UltimaBase.use(
			deterministicDatabasePlugin(new FailingWriteDatabaseAdapter(failure)),
			plugin({
				core: '^0.0.0',
				id: 'fixture.password-sign-up',
				version: '0.0.0',
				permissions: {
					'authority:elevate': 'Creates the User with Master authority.',
					'operation:declare': 'Tests the sign-up handler.',
					'typegen:reference': 'Retains the operation result contract.',
				},
				contributions: [withPluginPrivileges(signUp, ['authority:elevate'])],
			}),
		)
		await using app = new App({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'password-sign-up', value: 'fixture-secret' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			schemas: [PasswordUser],
		})
		await app.start()
		const context = RequestContext.anonymous({
			requestId: 'sign-up-duplicate',
			source: 'fixture',
		})
		return await runWithRequestEngine(app.withContext(context), () =>
			app
				.operation(passwordAuthOperations.signUp)
				.execute({ username: 'ada', password: 'a long enough password' }),
		)
	}

	it('rejects a duplicate identifier by its neutral unique index error (ADR-0302)', async () => {
		await expect(
			signUpWith(
				new FrameworkError('UNIQUE_VIOLATION', 'Duplicate username.', {
					publicDetails: { schema: 'User', fields: ['username'] },
				}),
			),
		).rejects.toMatchObject({ code: 'PASSWORD_AUTH_SIGN_UP_REJECTED' })
	})

	it('rejects invalid data opaquely and propagates other unique indexes', async () => {
		const otherIndex = new FrameworkError('UNIQUE_VIOLATION', 'Duplicate.', {
			publicDetails: { schema: 'User', fields: ['email'] },
		})
		const validation = new FrameworkError('VALIDATION_ERROR', 'Invalid.')

		await expect(signUpWith(otherIndex)).rejects.toBe(otherIndex)
		await expect(signUpWith(validation)).rejects.toMatchObject({
			code: 'PASSWORD_AUTH_SIGN_UP_REJECTED',
		})
	})
})
