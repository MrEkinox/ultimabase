import {
	ACL,
	aclPlugin,
	onACLChange,
	provideACLChangeObserver,
	type ACLChangedEvent,
	type aclChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { plugin, type PluginSourceState } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import type { PluginEventHandlerInput } from '@ultimabase/plugin-kit'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { requireACLValue } from './acl-test-fixtures.js'

type ACLChangeHandlerInput = PluginEventHandlerInput<
	typeof aclChangedEvent,
	ACLChangedEvent
>

let rejectNextUpdate = false
// PostgreSQL types the `postgres` table rules of `.with` (ADR-0320).
const ACLChangeApplication = UltimaBase.use(postgresPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())
const Post = ACLChangeApplication.Schema.define({
	className: 'ACLChangeEventPost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	acl: true,
}).with((plugins) =>
	plugins
		.hooks({
			afterOperation: {
				update: () => {
					if (!rejectNextUpdate) return

					rejectNextUpdate = false
					throw new Error('ACL change event rollback fixture')
				},
			},
		})
		.postgres({ table: 'acl_change_event_posts' })
		.acl({
			default: new ACL().grantPublic('read'),
		}),
)

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
const eventObserverPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	peers: [
		{ pluginId: '@ultimabase/acl-permissions-plugin', version: '^0.0.0' },
	],
	id: 'fixture.acl-change-events',
	permissions: {
		'runtime:observe': 'Observes committed ACL changes for the E2E fixture.',
	},
	contributions: [
		provideACLChangeObserver(
			'fixture.capture-acl-change',
			onACLChange(async ({ event }: ACLChangeHandlerInput) => {
				const row = await getFixture().pool.query<{ readonly id: string }>(
					'SELECT id FROM acl_change_event_posts WHERE id = $1',
					[event.payload.target.id],
				)

				committedChanges.push(event.payload)
				committedRows.push(...row.rows.map(({ id }) => id))
			}),
		),
	],
})

let ultimabase:
	| UltimaBase<
			readonly [typeof Post],
			readonly [
				ReturnType<typeof hooksPlugin>,
				typeof eventObserverPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		eventObserverPlugin,
		aclPlugin(),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-events-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
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
		const created = await Post.createOne({ data: { title: 'default' } })
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
			{ useMasterKey: true },
		)
		const createdACL = requireACLValue(
			created.acl,
			'Expected the created ACL to be materialized',
		)
		const replacement = createdACL
			.revokePublic('read')
			.grantAuthenticated('update')
		const start = committedChanges.length

		await Post.updateOne(
			{
				where: { id: { eq: created.id } },
				data: { acl: replacement },
			},
			{ useMasterKey: true },
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
				where: { id: { eq: created.id } },
				data: { acl: ACL.fromJSON(replacement.toJSON()) },
			},
			{ useMasterKey: true },
		)
		expect(committedChanges.slice(start)).toHaveLength(1)
	})

	it('discards queued ACL events when a later developer hook rolls back', async () => {
		const created = await Post.createOne(
			{ data: { title: 'rollback' } },
			{ useMasterKey: true },
		)
		const createdACL = requireACLValue(
			created.acl,
			'Expected the created ACL to be materialized',
		)
		const start = committedChanges.length

		rejectNextUpdate = true
		await expect(
			Post.updateOne(
				{
					where: { id: { eq: created.id } },
					data: { acl: createdACL.grantAuthenticated('update') },
				},
				{ useMasterKey: true },
			),
		).rejects.toThrow('ACL change event rollback fixture')
		expect(committedChanges).toHaveLength(start)

		const persisted = await Post.findOne(
			{ where: { id: { eq: created.id } }, select: { acl: true } },
			{ useMasterKey: true },
		)
		const persistedACL = requireACLValue(
			persisted?.acl,
			'Expected the persisted ACL to be materialized',
		)

		expect(persistedACL.toJSON()).toStrictEqual(createdACL.toJSON())
	})

	it('emits one deterministic event per create-many item', async () => {
		const start = committedChanges.length
		const created = await Post.createMany({
			data: [{ title: 'many-a' }, { title: 'many-b' }],
		})
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
