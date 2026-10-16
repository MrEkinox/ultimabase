import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	UltimaBase,
	getCurrentRequest,
	getRequestPrincipal,
	isAuthenticated,
	runWithRequestEngine,
} from '@ultimabase/core'
import {
	RequestContext,
	anonymous,
	authorizeMasterKey,
	withContext,
} from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0311: `start()` resolves to the application, `transaction(fn)` runs in
// the current request or a fresh anonymous one, and `useMasterKey` is a
// boolean whose `false` value never downgrades.
const App = UltimaBase.use(accessPlugin({ allowWithoutRule: { all: true } }))

const LifecycleTodo = App.Schema.define({
	className: 'LifecycleTodo',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with((plugins) =>
	plugins.access({ read: isAuthenticated, create: true, delete: true }),
)

const masterKey = 'application-lifecycle-master-secret'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'lifecycle', value: masterKey }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [LifecycleTodo],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}
const titles = async () =>
	(
		await LifecycleTodo.findMany(
			{ select: { title: true }, orderBy: { title: 'asc' } },
			{ useMasterKey: true },
		)
	).map((row) => row.title)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'app_lifecycle' })
	ultimabase = createApplication(fixture)
	await expect(ultimabase.start()).resolves.toBe(ultimabase)
}, 60_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ultimabase.transaction(fn) (ADR-0311)', () => {
	it('commits every call of the callback and resolves to its result', async () => {
		const result = await application().transaction(async () => {
			await LifecycleTodo.createOne({
				data: { title: 'commit-a' },
				select: { id: true },
			})
			await LifecycleTodo.createOne({
				data: { title: 'commit-b' },
				select: { id: true },
			})
			return 'done'
		})

		expect(result).toBe('done')
		expect(await titles()).toEqual(
			expect.arrayContaining(['commit-a', 'commit-b']),
		)
	})

	it('rolls every call back when the callback throws', async () => {
		const failure = new Error('rollback please')

		await expect(
			application().transaction(async () => {
				await LifecycleTodo.createOne({
					data: { title: 'rolled-back' },
					select: { id: true },
				})
				throw failure
			}),
		).rejects.toBe(failure)
		expect(await titles()).not.toContain('rolled-back')
	})

	it('refuses a nested transaction and rolls the outer one back', async () => {
		await expect(
			application().transaction(async () => {
				await LifecycleTodo.createOne({
					data: { title: 'nested-outer' },
					select: { id: true },
				})
				await application().transaction(() => 'inner')
			}),
		).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			message: 'Nested RequestEngine transactions are not supported.',
		})
		expect(await titles()).not.toContain('nested-outer')
	})

	it('keeps the current request, principal and Master included', async () => {
		const principal = LifecycleTodo.pointer(
			'01991f00-0000-7000-8000-000000000311',
		)
		const context = RequestContext.anonymous({
			requestId: 'lifecycle-principal',
			source: 'internal',
		}).withPrincipal(principal)
		const engine = withContext(application(), context)

		const seen = await runWithRequestEngine(engine, () =>
			application().transaction(async () => ({
				principal: await getRequestPrincipal(getCurrentRequest()),
				requestId: getCurrentRequest().requestId,
			})),
		)
		expect(seen.requestId).toBe('lifecycle-principal')
		expect(seen.principal).toEqual(principal)

		const master = await anonymous(application(), {
			requestId: 'lifecycle-master',
			source: 'internal',
		}).useMasterKey(
			authorizeMasterKey(application(), masterKey),
			'Lifecycle transaction test',
		)
		const mode = await runWithRequestEngine(master, () =>
			application().transaction(() => getCurrentRequest().access.mode),
		)
		expect(mode).toBe('master')
	})

	it('opens a fresh anonymous internal request outside any request', async () => {
		const request = await application().transaction(() => getCurrentRequest())

		expect(request.access.mode).toBe('anonymous')
		expect(request.source).toBe('internal')
	})

	it('rejects a callback that is not a function', async () => {
		await expect(application().transaction('nope' as never)).rejects.toThrow(
			'UltimaBase transaction callback must be a function',
		)
	})
})

describe('useMasterKey: boolean (ADR-0311)', () => {
	it('treats false as omission and never downgrades a Master context', async () => {
		await LifecycleTodo.createOne({
			data: { title: 'hidden' },
			select: { id: true },
		})
		await expect(
			LifecycleTodo.findMany(undefined, { useMasterKey: false }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const master = await anonymous(application(), {
			requestId: 'lifecycle-master-false',
			source: 'internal',
		}).useMasterKey(
			authorizeMasterKey(application(), masterKey),
			'Lifecycle useMasterKey test',
		)
		const rows = await runWithRequestEngine(master, () =>
			LifecycleTodo.findMany(
				{ select: { title: true } },
				{ useMasterKey: false },
			),
		)
		expect(rows.map((row) => row.title)).toContain('hidden')
	})

	it('elevates conditionally from server-side state', async () => {
		const read = (isScheduledJob: boolean) =>
			LifecycleTodo.count(undefined, { useMasterKey: isScheduledJob })

		await expect(read(true)).resolves.toBeGreaterThan(0)
		await expect(read(false)).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
	})

	it('rejects any other value before execution', async () => {
		await expect(
			LifecycleTodo.findMany(undefined, { useMasterKey: 'true' as never }),
		).rejects.toThrow('operation useMasterKey must be a boolean when present')
	})
})
