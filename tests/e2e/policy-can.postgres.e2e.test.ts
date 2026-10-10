import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	PublicError,
	RequestContext,
	RequestContextValue,
	UltimaBase,
	isAuthenticated,
	plugin,
	requestSources,
	runWithRequestEngine,
	type PointerValue,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0305: `ultimabase.can()` combines every installed policy (Access, ACL,
// Soft Delete) as at execution time, without executing anything.
const signedIn = new RequestContextValue<PointerValue>(
	'fixture.can.signed-in',
	(value) => value as PointerValue,
)
const identityPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.can-identity',
	version: '1.0.0',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => context.getValue(signedIn),
		}),
	],
})

const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin({ default: true }),
	hooksPlugin(),
	aclPlugin(),
)

let hookCalls = 0
let refuseUpdates: 'error' | 'public' | undefined

const CanUser = App.Schema.define({
	className: 'CanUser',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true, create: true } })

const CanTodo = App.Schema.define({
	className: 'CanTodo',
	fields: (field) => ({
		title: field.string({ required: true }),
		owner: field.string(),
	}),
})
	.softDelete()
	.acl()
	.with({
		access: {
			create: {
				allow: isAuthenticated,
				item: ({ item }) => item.title !== 'forbidden',
			},
			update: {
				allow: function notRefused() {
					if (refuseUpdates === 'public') {
						throw new PublicError('Updates are paused.')
					}
					if (refuseUpdates === 'error') throw new Error('policy store down')
					return true
				},
				item: ({ originalItem, principal }) =>
					originalItem.owner === principal?.id,
			},
			delete: isAuthenticated,
		},
		acl: { default: ({ principal }) => new ACL(principal) },
		hooks: {
			beforeOperation: {
				create: () => {
					hookCalls += 1
				},
				update: () => {
					hookCalls += 1
				},
			},
		},
	})

const CanExplicit = App.Schema.define({
	className: 'CanExplicit',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'explicit',
	// The explicit command key is typed by Typegen only (old declaration form).
	access: { softDelete: isAuthenticated } as never,
})

const masterKey = 'policy-can-master-secret'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		identityPlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'policy-can', value: masterKey }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		schemas: [CanUser, CanTodo, CanExplicit],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}

type UserPointer = ReturnType<typeof CanUser.pointer>
let ada: UserPointer
let grace: UserPointer
let adaTodo: string
let deletedTodo: string
let explicitRow: string

const as = (principal: PointerValue | undefined) => {
	const context = RequestContext.anonymous({
		requestId: `can-${String(Math.random())}`,
		source: requestSources.internal,
	})
	return application().withContext(
		principal === undefined ? context : context.withValue(signedIn, principal),
	)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'policy_can' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
	const master = { useMasterKey: true } as const
	const [adaRow, graceRow] = await CanUser.createMany(
		{ data: [{ name: 'Ada' }, { name: 'Grace' }] },
		master,
	)
	if (adaRow === undefined || graceRow === undefined) {
		throw new TypeError('Users are missing')
	}
	ada = CanUser.pointer(adaRow.id)
	grace = CanUser.pointer(graceRow.id)
	const owned = { context: as(ada).context }
	adaTodo = (
		await CanTodo.createOne({ data: { title: 'Ada', owner: ada.id } }, owned)
	).id
	deletedTodo = (
		await CanTodo.createOne({ data: { title: 'Gone', owner: ada.id } }, owned)
	).id
	await CanTodo.deleteOne(
		{ where: { id: { eq: deletedTodo } }, select: { id: true } },
		owned,
	)
	explicitRow = (
		await CanExplicit.createOne({ data: { title: 'Explicit' } }, master)
	).id
	hookCalls = 0
}, 60_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

const can = (
	principal: PointerValue | undefined,
	operation: string,
	item?: Readonly<Record<string, unknown>>,
	schema: typeof CanTodo | typeof CanExplicit = CanTodo,
) =>
	application().can({
		principal,
		operation,
		schema,
		...(item === undefined ? {} : { item }),
	})

describe('ultimabase.can() (ADR-0305)', () => {
	it('answers operations without an item from guards alone', async () => {
		await expect(can(undefined, 'create')).resolves.toBe(false)
		await expect(can(ada, 'create')).resolves.toBe(true)
		await expect(can(undefined, 'read')).resolves.toBe(true)
		await expect(can(undefined, 'delete')).resolves.toBe(false)
		// A filter counts as permitted for its rows.
		await expect(can(grace, 'update')).resolves.toBe(true)
	})

	it('runs value checks on candidate data for create', async () => {
		await expect(can(ada, 'create', { title: 'allowed' })).resolves.toBe(true)
		await expect(can(ada, 'create', { title: 'forbidden' })).resolves.toBe(
			false,
		)
	})

	it('checks persisted rows against every policy, hidden rows included', async () => {
		// ACL: Ada owns the row; Grace has no right on it.
		await expect(can(ada, 'read', { id: adaTodo })).resolves.toBe(true)
		await expect(can(grace, 'read', { id: adaTodo })).resolves.toBe(false)
		await expect(can(ada, 'one', { id: adaTodo })).resolves.toBe(true)
		// Soft Delete hides deleted rows from every caller.
		await expect(can(ada, 'read', { id: deletedTodo })).resolves.toBe(false)
		// Access item checks run with the row as originalItem.
		await expect(can(ada, 'update', { id: adaTodo })).resolves.toBe(true)
		await expect(can(grace, 'update', { id: adaTodo })).resolves.toBe(false)
		await expect(can(ada, 'delete', { id: adaTodo })).resolves.toBe(true)
		await expect(
			can(ada, 'read', { id: '0199c2d0-0000-7000-8000-0000000000ee' }),
		).resolves.toBe(false)
	})

	it('evaluates plugin mutation keys', async () => {
		await expect(
			can(undefined, 'softDelete', undefined, CanExplicit),
		).resolves.toBe(false)
		await expect(
			can(ada, 'softDelete', { id: explicitRow }, CanExplicit),
		).resolves.toBe(true)
		await expect(can(ada, 'restore', undefined, CanExplicit)).resolves.toBe(
			false,
		)
	})

	it('defaults to the current request principal and lets Master do anything', async () => {
		await expect(
			runWithRequestEngine(as(ada), () =>
				application().can({
					operation: 'update',
					schema: CanTodo,
					item: { id: adaTodo },
				}),
			),
		).resolves.toBe(true)
		await expect(
			runWithRequestEngine(as(grace), () =>
				application().can({
					operation: 'update',
					schema: CanTodo,
					item: { id: adaTodo },
				}),
			),
		).resolves.toBe(false)
		const master = await as(undefined).useMasterKey(
			application().authorizeMasterKey(masterKey),
			'can test',
		)
		await expect(
			runWithRequestEngine(master, () =>
				application().can({ operation: 'delete', schema: CanTodo }),
			),
		).resolves.toBe(true)
	})

	it('answers false for a PublicError, propagates other errors, never executes', async () => {
		refuseUpdates = 'public'
		await expect(can(ada, 'update', { id: adaTodo })).resolves.toBe(false)
		refuseUpdates = 'error'
		await expect(can(ada, 'update', { id: adaTodo })).rejects.toThrow(
			'policy store down',
		)
		refuseUpdates = undefined
		await expect(
			application().can({ operation: 'archive', schema: CanTodo }),
		).rejects.toThrow('can() received an unknown operation')

		expect(hookCalls).toBe(0)
		await expect(CanTodo.count({}, { useMasterKey: true })).resolves.toBe(1)
		await expect(
			CanTodo.findOne(
				{ where: { id: { eq: adaTodo } }, select: { title: true } },
				{ useMasterKey: true },
			),
		).resolves.toMatchObject({ title: 'Ada' })
	})
})
