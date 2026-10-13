import { UltimaBase, provideRuntimeBehavior } from '@ultimabase/core'
import {
	plugin,
	withPluginPrivileges,
	type PluginContribution,
} from '@ultimabase/core/plugin'
import {
	createPluginEventDispatcher,
	definePlugin,
	definePluginEvent,
	definePluginEventCapability,
	observePluginEvent,
	optionalPluginEvents,
	providePluginEvent,
} from '@ultimabase/plugin-kit'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0318 amendment: a failure after commit never rejects the call. Core's
// postCommit stage, definePlugin `afterCommit` and plugin events log it and
// run the remaining effects.
const trace: string[] = []

const noteWritten = definePluginEvent<{ readonly body: string }>()(
	'fixture.note-written',
	{ delivery: 'optional' },
)
const noteEvents = definePluginEventCapability({
	capabilityId: 'fixture.post-commit-note-events',
	version: '1.0.0',
})
const noteEventsRequirement = optionalPluginEvents(noteEvents, '^1.0.0')

const postCommitPlugin = (id: string, postCommit: () => void) =>
	plugin({
		core: '^0.0.0',
		id,
		version: '1.0.0',
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'post-commit',
				create: () => ({ value: { postCommit } }),
			}),
		],
	})

const failingStage = postCommitPlugin('fixture.failing-post-commit', () => {
	trace.push('stage:failing')
	throw new Error('post-commit stage failure')
})
const laterStage = postCommitPlugin('fixture.later-post-commit', () => {
	trace.push('stage:later')
})

const failingAfterCommit = definePlugin({
	name: '@fixture/failing-after-commit',
	afterCommit: () => {
		trace.push('afterCommit:failing')
		throw new Error('definePlugin afterCommit failure')
	},
})

const contributions: readonly PluginContribution[] = [
	noteEventsRequirement,
	withPluginPrivileges(
		provideRuntimeBehavior({
			contributionId: 'note-events',
			create: ({ assertPrivilege, capabilities, owner }) => {
				const events = createPluginEventDispatcher({
					assertPrivilege,
					capabilities,
					owner,
					requirement: noteEventsRequirement,
				})
				return {
					value: {
						beforeOperation: ({ context, operation }) => {
							if (operation.kind !== 'create-one') return
							events.emit(context, noteWritten, { body: 'written' })
						},
					},
				}
			},
		}),
		['event:publish'],
	),
]
const emitter = plugin({
	core: '^0.0.0',
	id: 'fixture.note-event-emitter',
	version: '1.0.0',
	permissions: { 'event:publish': 'Publishes note events.' },
	contributions,
})
const observers = plugin({
	core: '^0.0.0',
	id: 'fixture.note-event-observers',
	version: '1.0.0',
	permissions: { 'runtime:observe': 'Observes note events.' },
	contributions: [
		providePluginEvent(
			noteEvents,
			'failing-observer',
			observePluginEvent(noteWritten, () => {
				trace.push('event:failing')
				throw new Error('plugin event observer failure')
			}),
		),
		providePluginEvent(
			noteEvents,
			'later-observer',
			observePluginEvent(noteWritten, ({ event }) => {
				trace.push(`event:later:${event.payload.body}`)
			}),
		),
	],
})

const App = UltimaBase.use(
	failingStage,
	laterStage,
	failingAfterCommit,
	emitter,
	observers,
)

const Note = App.Schema.define({
	className: 'PostCommitFailureNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})

const logger = createCapturingLogger()
let fixture: PostgresWorkerFixture | undefined
let ultimabase: { dispose(): Promise<void> } | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'post_commit_fail' })
	const app = new (App.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ logger, schemas: [Note] })
	ultimabase = app
	try {
		await app.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

beforeEach(() => {
	trace.length = 0
	logger.clear()
})

describe('post-commit failures (ADR-0318 amendment)', () => {
	it('resolves the committed call, logs each failure and runs the later effects', async () => {
		await expect(
			Note.createOne({ data: { body: 'secret-body-value' } }),
		).resolves.toMatchObject({ body: 'secret-body-value' })

		// Effects run in queue order: events emitted during the write first.
		expect(trace).toStrictEqual([
			'event:failing',
			'event:later:written',
			'stage:failing',
			'stage:later',
			'afterCommit:failing',
		])
		const errors = logger.messages('error')
		expect(errors).toHaveLength(3)
		expect(errors).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^UltimaBase: the postCommit stage of fixture\.failing-post-commit failed after commit \(request .+\); the committed write is kept and the call is not rejected$/u,
				),
				expect.stringContaining(
					'the postCommit stage of @fixture/failing-after-commit failed after commit',
				),
				expect.stringContaining(
					'the "fixture.note-written" event observer of fixture.note-event-observers failed after commit',
				),
			]),
		)
		// The log line names the request, never the written values.
		expect(errors.join('\n')).not.toContain('secret-body-value')
		await expect(
			Note.findOne({ where: { body: { eq: 'secret-body-value' } } }),
		).resolves.not.toBeNull()
	})
})
