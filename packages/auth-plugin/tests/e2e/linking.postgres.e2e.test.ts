import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	authErrorCodes,
	authPlugin,
	type AuthLinking,
} from '../../src/index.js'
import { fakeLink, fakeMethod, fakeSignIn } from './fake-method.js'

let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_linking' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const createApplication = (linking: AuthLinking) => {
	const App = UltimaBase.use(
		postgresPlugin({ pool: pool(), schemaPolicy: 'override' }),
		authPlugin({ linking, methods: [fakeMethod()] }),
	)
	const LinkedUser = App.UserSchema.define({ className: 'LinkedUser' })
	const ultimabase = new App({ logger: false, schemas: [LinkedUser] })
	const signIn = (
		providerUserId: string,
		email: string | null,
		emailVerified: boolean,
	) =>
		ultimabase
			.operation(fakeSignIn)
			.execute({ email, emailVerified, providerUserId })
	const asUser = <TResult>(token: string, run: () => Promise<TResult>) =>
		ultimabase.plugin(authPlugin).runWithSession(token, run)
	return { LinkedUser, asUser, signIn, ultimabase }
}

describe('account linking', { concurrent: false }, () => {
	it('links automatically only when both sides verified the same email', async () => {
		const { LinkedUser, asUser, signIn, ultimabase } =
			createApplication('verified-email')
		await ultimabase.start()
		try {
			const first = await signIn('github|1', 'ada@example.test', true)
			const again = await signIn('github|1', 'ada@example.test', true)
			expect(again.user.id).toBe(first.user.id)
			const linked = await signIn('google|1', 'ada@example.test', true)
			expect(linked.user.id).toBe(first.user.id)
			const unverified = await signIn('gitlab|1', 'ada@example.test', false)
			expect(unverified.user.id).not.toBe(first.user.id)
			const { methods } = await asUser(first.session.token, () =>
				LinkedUser.listMethods(),
			)
			expect(methods.map(({ email, method }) => [method, email])).toStrictEqual(
				[
					['fake', 'ada@example.test'],
					['fake', 'ada@example.test'],
				],
			)
			expect(JSON.stringify(methods)).not.toContain('github|1')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('links only on request in manual mode and never removes the last method', async () => {
		const { LinkedUser, asUser, signIn, ultimabase } =
			createApplication('manual')
		await ultimabase.start()
		const now = Date.now()
		try {
			const first = await signIn('github|2', 'bob@example.test', true)
			const other = await signIn('google|2', 'bob@example.test', true)
			expect(other.user.id).not.toBe(first.user.id)
			const linked = await asUser(first.session.token, () =>
				ultimabase.operation(fakeLink).execute({
					email: 'bob@example.test',
					emailVerified: true,
					providerUserId: 'apple|2',
				}),
			)
			expect((await signIn('apple|2', null, false)).user.id).toBe(first.user.id)
			const { methods } = await asUser(first.session.token, () =>
				LinkedUser.listMethods(),
			)
			expect(methods.map(({ id }) => id)).toContain(linked.id)
			const [oldest] = methods
			if (oldest === undefined) throw new TypeError('No linked method')

			vi.useFakeTimers({ now: now + 10 * 60_000, toFake: ['Date'] })
			await expect(
				asUser(first.session.token, () => LinkedUser.unlinkMethod(oldest.id)),
			).rejects.toMatchObject({ code: authErrorCodes.reauthenticationRequired })
			vi.useRealTimers()
			await asUser(first.session.token, () =>
				LinkedUser.unlinkMethod(oldest.id),
			)
			await expect(
				asUser(first.session.token, () => LinkedUser.unlinkMethod(linked.id)),
			).rejects.toMatchObject({ code: authErrorCodes.lastMethod })
			await expect(
				asUser(first.session.token, () => LinkedUser.unlinkMethod(oldest.id)),
			).rejects.toMatchObject({ code: authErrorCodes.notFound })
			await expect(
				asUser(other.session.token, () => LinkedUser.unlinkMethod(linked.id)),
			).rejects.toMatchObject({ code: authErrorCodes.notFound })
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})
})
