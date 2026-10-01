import {
	RequestContext,
	UltimaBase,
	plugin,
	runWithRequestEngine,
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
