import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import {
	ACL,
	acl,
	aclPlugin,
	onACLChange,
	type ACLChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	definePlugin,
	stringField,
} from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

let rejectNextUpdate = false
const Post = Schema.define({
	className: 'ACLChangeEventPost',
	fields: { title: stringField({ validation: { required: true } }) },
	hooks: {
		afterOperation: {
			update: () => {
				if (!rejectNextUpdate) return

				rejectNextUpdate = false
				throw new Error('ACL change event rollback fixture')
			},
		},
	},
	extensions: [
		acl({
			default: new ACL().grantPublic('read'),
			resolveInput: ({ currentAcl, inputAcl }) => inputAcl ?? currentAcl,
		}),
		postgresTable({ name: 'acl_change_event_posts' }),
	],
})

const committedChanges: ACLChangedEvent[] = []
const committedRows: string[] = []
let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('ACL event PostgreSQL fixture has not started')
	}

	return fixture
}

/** Captures the public event and proves its row is visible only after commit. */
const eventObserverPlugin = definePlugin({
	name: 'fixture.acl-change-events',
	setup: ({ registries }) => {
		registries.events.register(
			'fixture.capture-acl-change',
			onACLChange(async ({ event }) => {
				const row = await getFixture().pool.query<{ readonly id: string }>(
					'SELECT id FROM acl_change_event_posts WHERE id = $1',
					[event.payload.target.id],
				)

				committedChanges.push(event.payload)
				committedRows.push(...row.rows.map(({ id }) => id))
			}),
		)
	},
})

let ultimabase:
	| UltimaBase<
			readonly [typeof Post],
			readonly [
				typeof eventObserverPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
				ReturnType<typeof aclPostgresPlugin>,
			]
	  >
	| undefined

const getApplication = () => {
	if (ultimabase === undefined) {
		throw new TypeError('ACL event application has not started')
	}

	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-events-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			eventObserverPlugin,
			aclPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
			aclPostgresPlugin(),
		],
		schemas: [Post],
	})
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL committed events with PostgreSQL', { concurrent: false }, () => {
	it('emits default ACL creation only after anonymous commit', async () => {
		const start = committedChanges.length
		const created = await Post.createOne(
			{ data: { title: 'default' } },
			{ ultimabase: getApplication() },
		)
		const [event] = committedChanges.slice(start)

		expect(event).toStrictEqual({
			actor: { authority: 'anonymous', principal: null },
			diff: {
				added: [{ permissions: ['read'], subject: { kind: 'public' } }],
				removed: [],
			},
			operation: 'create',
			target: { className: Post.className, id: created.id },
		})
		expect(committedRows).toContain(created.id)
		expect(Object.isFrozen(event)).toBe(true)
	})

	it('reports one structured master update without duplicate no-op events', async () => {
		const created = await Post.createOne(
			{
				data: {
					acl: new ACL().grantPublic('read').grantAuthenticated('read'),
					title: 'updated',
				},
			},
			{ ultimabase: getApplication(), useMasterKey: true },
		)
		const replacement = created.acl
			.revokePublic('read')
			.grantAuthenticated('update')
		const start = committedChanges.length

		await Post.updateOne(
			{
				where: (where) => where.eq('id', created.id),
				data: { acl: replacement },
			},
			{ ultimabase: getApplication(), useMasterKey: true },
		)

		expect(committedChanges.slice(start)).toStrictEqual([
			{
				actor: { authority: 'master', principal: null },
				diff: {
					added: [
						{
							permissions: ['update'],
							subject: { kind: 'authenticated' },
						},
					],
					removed: [{ permissions: ['read'], subject: { kind: 'public' } }],
				},
				operation: 'update',
				target: { className: Post.className, id: created.id },
			},
		])

		await Post.updateOne(
			{
				where: (where) => where.eq('id', created.id),
				data: { acl: ACL.fromJSON(replacement.toJSON()) },
			},
			{ ultimabase: getApplication(), useMasterKey: true },
		)
		expect(committedChanges.slice(start)).toHaveLength(1)
	})

	it('discards queued ACL events when a later developer hook rolls back', async () => {
		const created = await Post.createOne(
			{ data: { title: 'rollback' } },
			{ ultimabase: getApplication(), useMasterKey: true },
		)
		const start = committedChanges.length

		rejectNextUpdate = true
		await expect(
			Post.updateOne(
				{
					where: (where) => where.eq('id', created.id),
					data: { acl: created.acl.grantAuthenticated('update') },
				},
				{ ultimabase: getApplication(), useMasterKey: true },
			),
		).rejects.toThrow('ACL change event rollback fixture')
		expect(committedChanges).toHaveLength(start)

		const persisted = await Post.findOne(
			{ where: { id: { eq: created.id } }, select: { acl: true } },
			{ ultimabase: getApplication(), useMasterKey: true },
		)

		expect(persisted?.acl.toJSON()).toStrictEqual(created.acl.toJSON())
	})

	it('emits one deterministic event per create-many item', async () => {
		const start = committedChanges.length
		const created = await Post.createMany(
			{ data: [{ title: 'many-a' }, { title: 'many-b' }] },
			{ ultimabase: getApplication() },
		)
		const events = committedChanges.slice(start)

		expect(events).toHaveLength(2)
		expect(events.map(({ operation }) => operation)).toStrictEqual([
			'create',
			'create',
		])
		expect(events.map(({ target }) => target.id)).toStrictEqual(
			created.map(({ id }) => id),
		)
	})
})
