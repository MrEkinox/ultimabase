import { accessPlugin, isSelf } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	getCurrentRequest,
	type Pointer,
	UltimaBase,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	authErrorCodes,
	authPlugin,
	snapshotSignUpInput,
} from '../../src/index.js'
import { createProbeApplication } from './probe-application.js'
import {
	probeMethod,
	probeRun,
	readProbePath,
	readProbeRecord,
	readProbeString,
	type ProbeScenario,
} from './probe-method.js'

let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_user_data' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

/** The note the detached sign-up points to, set once the application exists. */
let pinnedNote: Pointer | undefined

const scenarios: Readonly<Record<string, ProbeScenario>> = {
	'create-detached': (services, context, input) => {
		const handle = readProbeString(readProbeRecord(input), 'handle')
		// A method detaches its input before credential work, then creates.
		const data = snapshotSignUpInput(
			{
				avatar: new Uint8Array([1, 2, 3]),
				handle,
				labels: ['a', 'b'],
				pinned: { connect: pinnedNote },
				settings: { theme: { dark: true } },
			},
			'probe.sign-up',
			['handle'],
		)
		return services.createUser(data, context)
	},
	'create-user': (services, context, input) =>
		services.createUser(readProbeRecord(input), context),
	login: (services, context, input) =>
		services.signIn({
			context,
			method: 'probe',
			userId: readProbeString(readProbeRecord(input), 'userId'),
		}),
}

const readSession = (value: unknown) => ({
	id: readProbeString(readProbeRecord(readProbePath(value, 'session')), 'id'),
	token: readProbeString(
		readProbeRecord(readProbePath(value, 'session')),
		'token',
	),
})

const readId = (value: unknown): string => {
	if (typeof value !== 'string') throw new TypeError('No user id')
	return value
}

describe('User data written by methods', { concurrent: false }, () => {
	it('restores detached sign-up values and refuses a taken unique value', async () => {
		const { ProbeNote, ProbeUser, run, ultimabase } = createProbeApplication(
			pool(),
			{ scenarios },
		)
		await ultimabase.start()
		try {
			const note = await ProbeNote.createOne({ data: { title: 'pinned' } })
			pinnedNote = ProbeNote.pointer(note.id)
			const id = readId(await run('create-detached', { handle: 'ada' }))
			const user = await ProbeUser.findOne({ where: { id } })
			expect(user).toMatchObject({
				handle: 'ada',
				labels: ['a', 'b'],
				pinned: { id: note.id },
				settings: { theme: { dark: true } },
			})
			expect([...(user?.avatar ?? [])]).toStrictEqual([1, 2, 3])
			// A duplicate unique value is refused without naming the field.
			const duplicate = run('create-detached', { handle: 'ada' })
			await expect(duplicate).rejects.toMatchObject({
				code: authErrorCodes.signUpRejected,
				publicMessage: 'Sign-up was rejected.',
			})
			await expect(duplicate).rejects.not.toHaveProperty('publicDetails.fields')
		} finally {
			pinnedNote = undefined
			await ultimabase.dispose()
		}
	})

	it('checks the User data of every create and upsert, and only the User’s', async () => {
		const reserved = 'root'
		const { ProbeNote, ProbeUser, run, ultimabase } = createProbeApplication(
			pool(),
			{
				checkUserData: (data) => {
					if (data.nickname === reserved) {
						throw new TypeError('nickname root is reserved')
					}
				},
				scenarios,
			},
		)
		await ultimabase.start()
		try {
			const where = { id: '0199325a-0c00-7000-8000-0000000000aa' }
			const refusals = [
				() => ProbeUser.createOne({ data: { nickname: reserved } }),
				() =>
					ProbeUser.createMany({
						data: [{ nickname: 'ok' }, { nickname: reserved }],
					}),
				() =>
					ProbeUser.upsertOne({
						create: { nickname: reserved },
						update: { nickname: 'ok' },
						where,
					}),
				() =>
					ProbeUser.upsertMany({
						data: [
							{
								create: { nickname: reserved },
								update: { nickname: 'ok' },
								where,
							},
						],
					}),
				() => run('create-user', { nickname: reserved }),
			]
			for (const refusal of refusals) {
				await expect(refusal()).rejects.toThrow()
			}
			expect(
				await ProbeUser.findMany({
					where: { nickname: { in: ['ok', reserved] } },
				}),
			).toStrictEqual([])
			// Updates and other schemas are not creates of the User.
			const created = await ProbeUser.createOne({ data: { nickname: 'ok' } })
			await ProbeUser.updateOne({
				data: { nickname: reserved },
				where: { id: created.id },
			})
			expect(
				await ProbeUser.findOne({ where: { id: created.id } }),
			).toMatchObject({ nickname: reserved })
			const note = await ProbeNote.createOne({ data: { title: reserved } })
			expect(await ProbeNote.findOne({ where: { id: note.id } })).toMatchObject(
				{ title: reserved },
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps the email fields to the authentication flows, even for Master', async () => {
		const App = UltimaBase.use(
			postgresPlugin({ pool: pool(), schemaPolicy: 'override' }),
			authPlugin({ methods: [probeMethod({ scenarios, userEmail: true })] }),
		)
		const MasterUser = App.UserSchema.define({ className: 'MasterUser' })
		const ultimabase = new App({
			logger: false,
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'auth-plugin-e2e', value: 'server-only' }],
				onUse: () => undefined,
			}),
			schemas: [MasterUser],
		})
		await ultimabase.start()
		try {
			const id = await ultimabase
				.plugin(authPlugin)
				.createUser({ data: {}, email: 'master@example.test' })
			const write: unknown = Reflect.get(MasterUser, 'ultimabaseAuthWriteEmail')
			if (typeof write !== 'function') throw new TypeError('No email write')
			const forged = async () => {
				await Reflect.apply(write, MasterUser, [
					{ id, input: { email: 'forged@example.test' }, select: { id: true } },
					{ useMasterKey: true },
				])
			}
			// The owned mutation accepts only the flows' marked context.
			await expect(forged()).rejects.toMatchObject({
				cause: {
					message:
						'The email fields are written only by the authentication flows',
				},
				message: 'Schema mutation ultimabase.auth.write-email handler failed.',
			})
			expect(
				await MasterUser.findOne({ where: { id } }, { useMasterKey: true }),
			).toMatchObject({ email: 'master@example.test' })
		} finally {
			await ultimabase.dispose()
		}
	})
})

/** How the User's read rule treats its own row while a test runs. */
let readRule: 'denied' | 'self' = 'self'

describe('a User its owner cannot read', { concurrent: false }, () => {
	it('fails authentication with AUTH_USER_NOT_READABLE, which names the missing rule', async () => {
		const App = UltimaBase.use(
			postgresPlugin({ pool: pool(), schemaPolicy: 'override' }),
			accessPlugin(),
			authPlugin({ methods: [probeMethod({ scenarios })] }),
			graphqlPlugin(),
		)
		const HiddenUser = App.UserSchema.define({
			className: 'HiddenUser',
		}).with({
			access: {
				create: false,
				read: (input) => (readRule === 'self' ? isSelf(input) : false),
			},
		})
		const ultimabase = new App({ logger: false, schemas: [HiddenUser] })
		const started = await ultimabase.start()
		const auth = ultimabase.plugin(authPlugin)
		const login = (userId: string) =>
			ultimabase
				.operation(probeRun)
				.execute({ input: { userId }, scenario: 'login' })
		try {
			readRule = 'self'
			const userId = await auth.createUser({ data: {} })
			const session = readSession(await login(userId))
			const graphql = started.plugin('@ultimabase/graphql-plugin')
			const asUser = <TResult>(work: () => Promise<TResult>) =>
				auth.runWithSession(session.token, work)
			// GraphQL serves the foundation's operations through their codecs.
			const read = await asUser(() =>
				graphql.execute({
					context: getCurrentRequest(),
					document:
						'query { current { id } listSessions { sessions { id current } } }',
				}),
			)
			expect(read).toMatchObject({
				data: {
					current: { id: userId },
					listSessions: { sessions: [{ current: true, id: session.id }] },
				},
			})
			const revoked = await asUser(() =>
				graphql.execute({
					context: getCurrentRequest(),
					document: `mutation { revokeSession(input: { id: "${session.id}" }) { revoked } }`,
				}),
			)
			expect(revoked).toMatchObject({
				data: { revokeSession: { revoked: true } },
			})

			readRule = 'denied'
			const notReadable = { code: authErrorCodes.userNotReadable }
			const failed = login(userId)
			await expect(failed).rejects.toMatchObject(notReadable)
			await expect(failed).rejects.toThrow(
				'HiddenUser.with({ access: { read: isSelf } })',
			)
			readRule = 'self'
			const fresh = readSession(await login(userId))
			readRule = 'denied'
			await expect(
				auth.runWithSession(fresh.token, () => HiddenUser.current()),
			).rejects.toMatchObject(notReadable)
			await expect(HiddenUser.refresh(fresh.token)).rejects.toMatchObject(
				notReadable,
			)
		} finally {
			readRule = 'self'
			await ultimabase.dispose()
		}
	})
})
