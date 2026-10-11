import { FrameworkError, UltimaBase } from '@ultimabase/core'
import { defineEvent, hooksPlugin, onEvent } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { createCapturingLogger, waitForAfterCommit } from '@ultimabase/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0318: hooks on plain data, `all`, upsert, afterCommit, typed events,
// global hooks and bounded recursion, in the generation-free form D.
const trace: string[] = []
const recorded: unknown[] = []
let holdAfterCommit: Promise<void> | undefined

const slugify = (title: string): string =>
	title.trim().toLowerCase().replace(/\s+/gu, '-')

const todoCreated = defineEvent<{ readonly title: string }>('todo.created')
const unconsumed = defineEvent<{ readonly title: string }>('todo.unconsumed')

const App = UltimaBase.use(
	hooksPlugin({
		events: [
			onEvent(todoCreated, ({ event }) => {
				trace.push(`event:first:${event.payload.title}`)
				throw new Error('first consumer failed')
			}),
			onEvent(todoCreated, async ({ context, event }) => {
				trace.push(
					`event:second:${event.payload.title}:${String(context.transactionId === event.transactionId)}`,
				)
				// Consumers run outside the committed transaction and use the normal API.
				await Note.createOne({ data: { body: `event:${event.payload.title}` } })
			}),
		],
		global: {
			afterCommit: {
				all: ({ kind, schema }) => {
					trace.push(`commit:global:${schema}:${kind}`)
				},
			},
			beforeOperation: {
				create: ({ item, schema }) => {
					const title = typeof item.title === 'string' ? item.title : ''
					trace.push(`before:global:${schema}:${title}`)
				},
			},
		},
	}),
)

const Note = App.Schema.define({
	className: 'HookDataNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
}).with({})

const List = App.Schema.define({
	className: 'HookDataList',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({})

const Tag = App.Schema.define({
	className: 'HookDataTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
}).with({})

const Todo = App.Schema.define({
	className: 'HookDataTodo',
	fields: (field) => ({
		title: field.string({
			required: true,
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		slug: field.string(),
		note: field.string({
			hooks: {
				resolveInput: ({ value }) => {
					trace.push(`field:note:${value}`)
					return undefined
				},
			},
		}),
		views: field.int({ default: 0 }),
		done: field.boolean({ default: false }),
		list: field.pointer({ target: () => List }),
		parent: field.pointer({ target: () => Todo }),
		tags: field.relation({ target: () => Tag }),
	}),
}).with({
	indexes: [{ fields: ['slug'], unique: true }],
	hooks: {
		resolveInput: {
			all: ({ kind }) => {
				trace.push(`resolve:all:${kind}`)
				return undefined
			},
			create: ({ data }) => ({ ...data, slug: slugify(data.title) }),
			update: ({ changes }) => {
				recorded.push(changes)
				return changes.title === undefined
					? undefined
					: { ...changes, slug: slugify(changes.title) }
			},
			upsert: ({ changes, data, mode }) => {
				trace.push(`resolve:upsert:${mode}`)
				return { data: { ...data, slug: slugify(data.title) }, changes }
			},
		},
		beforeOperation: {
			all: ({ kind }) => {
				trace.push(`before:all:${kind}`)
			},
			create: ({ context, item }) => {
				trace.push(`before:create:${item.title}`)
				context.emit(todoCreated, { title: item.title })
				context.emit(unconsumed, { title: item.title })
			},
			upsert: ({ item, mode, originalItem }) => {
				trace.push(
					`before:upsert:${mode}:${item.title}:${String(originalItem?.title)}`,
				)
			},
		},
		afterOperation: {
			update: async ({ changes, item }) => {
				// A child completing completes its parent: a legitimate cascade.
				if (changes.done === true && item.parent !== null) {
					await Todo.updateOne({
						where: { id: { eq: item.parent.id } },
						data: { done: true },
					})
				}
			},
		},
		afterCommit: {
			all: ({ kind }) => {
				trace.push(`commit:all:${kind}`)
			},
			create: async ({ item }) => {
				await holdAfterCommit
				trace.push(`commit:create:${item.title}`)
				if (item.title === 'fail commit') throw new Error('afterCommit failed')
			},
		},
	},
})

const Counter = App.Schema.define({
	className: 'HookDataCounter',
	fields: (field) => ({ n: field.int({ default: 0 }) }),
}).with({
	hooks: {
		afterOperation: {
			// Unbounded self-recursion: the depth limit stops it.
			update: async ({ item }) => {
				await Counter.updateOne({
					where: { id: { eq: item.id } },
					data: { n: { increment: 1 } },
				})
			},
		},
	},
})

const logger = createCapturingLogger()
let fixture: PostgresWorkerFixture | undefined
let ultimabase: { dispose(): Promise<void> } | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'hook_data' })
	const app = new (App.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ logger, schemas: [Note, List, Tag, Todo, Counter] })
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

beforeEach(async () => {
	// Work left by the previous test must not reach this one's trace.
	await waitForAfterCommit()
	trace.length = 0
	recorded.length = 0
	holdAfterCommit = undefined
	logger.clear()
})

describe('Hooks on plain data (ADR-0318)', () => {
	it('resolves create data, then runs global, all and create in order', async () => {
		const todo = await Todo.createOne({ data: { title: '  First Todo ' } })
		expect(todo).toMatchObject({ slug: 'first-todo', title: 'First Todo' })
		expect(
			trace.filter((line) => /^(?:resolve|before):/u.test(line)),
		).toStrictEqual([
			'resolve:all:create',
			'before:global:HookDataTodo:First Todo',
			'before:all:create',
			'before:create:First Todo',
		])
		await waitForAfterCommit()
	})

	it('gives update hooks only the changes, with readable atomic operations', async () => {
		const todo = await Todo.createOne({ data: { title: 'Count me' } })
		await waitForAfterCommit()
		recorded.length = 0
		const updated = await Todo.updateOne({
			where: { id: { eq: todo.id } },
			data: { views: { increment: 2 } },
		})
		// Core's generated `updatedAt` is part of what the update changes.
		expect(recorded).toHaveLength(1)
		expect(recorded[0]).toMatchObject({ views: { increment: 2 } })
		expect(Object.keys(recorded[0] ?? {}).sort()).toStrictEqual([
			'updatedAt',
			'views',
		])
		expect(updated?.views).toBe(2)

		recorded.length = 0
		const renamed = await Todo.updateOne({
			where: { id: { eq: todo.id } },
			data: { title: 'Renamed Todo' },
		})
		expect(recorded).toHaveLength(1)
		expect(recorded[0]).toMatchObject({ title: 'Renamed Todo' })
		expect(Object.keys(recorded[0] ?? {}).sort()).toStrictEqual([
			'title',
			'updatedAt',
		])
		expect(renamed).toMatchObject({ slug: 'renamed-todo', views: 2 })
	})

	it('shows pointer and join-table link changes, a set as its difference', async () => {
		const list = await List.createOne({ data: { name: 'Inbox' } })
		const [red, green, blue] = await Tag.createMany({
			data: [{ label: 'red' }, { label: 'green' }, { label: 'blue' }],
		})
		if (red === undefined || green === undefined || blue === undefined) {
			throw new TypeError('Expected three tags')
		}
		const todo = await Todo.createOne({
			data: { title: 'Linked', tags: { connect: [red.id, green.id] } },
		})
		await waitForAfterCommit()

		recorded.length = 0
		await Todo.updateOne({
			where: { id: { eq: todo.id } },
			data: { list: { connect: list.id }, tags: { set: [green.id, blue.id] } },
		})
		expect(recorded).toHaveLength(1)
		const [changes] = recorded as [Readonly<Record<string, unknown>>]
		expect(changes.tags).toStrictEqual({
			connect: [blue.id],
			disconnect: [red.id],
		})
		expect(changes.list).toMatchObject({ id: list.id })
	})

	it('runs upsert hooks with the resolved mode', async () => {
		await Todo.upsertOne({
			where: { slug: { eq: 'upserted' } },
			create: { title: 'Upserted' },
			update: { views: { increment: 1 } },
		})
		await Todo.upsertOne({
			where: { slug: { eq: 'upserted' } },
			create: { title: 'Upserted' },
			update: { views: { increment: 1 } },
		})
		expect(
			trace.filter((line) => /^(?:resolve|before):.*upsert/u.test(line)),
		).toStrictEqual([
			'resolve:all:upsert',
			'resolve:upsert:create',
			'before:all:upsert',
			'before:upsert:create:Upserted:undefined',
			'resolve:all:upsert',
			'resolve:upsert:update',
			'before:all:upsert',
			'before:upsert:update:Upserted:Upserted',
		])
		await waitForAfterCommit()
	})

	it('never calls a field hook for null', async () => {
		await Todo.createOne({ data: { note: null, title: 'No note' } })
		await Todo.createOne({ data: { note: 'kept', title: 'With note' } })
		expect(trace.filter((line) => line.startsWith('field:'))).toStrictEqual([
			'field:note:kept',
		])
		await waitForAfterCommit()
	})

	it('runs a legitimate parent cascade through the same hook', async () => {
		const root = await Todo.createOne({ data: { title: 'Root' } })
		const middle = await Todo.createOne({
			data: { parent: { connect: root.id }, title: 'Middle' },
		})
		const leaf = await Todo.createOne({
			data: { parent: { connect: middle.id }, title: 'Leaf' },
		})
		await Todo.updateOne({
			where: { id: { eq: leaf.id } },
			data: { done: true },
		})
		await expect(
			Todo.findOne({ where: { id: { eq: root.id } } }),
		).resolves.toMatchObject({ done: true })
		await waitForAfterCommit()
	})

	it('stops unbounded recursion at 16 nested operations and rolls back', async () => {
		const counter = await Counter.createOne({ data: {} })
		const failure = await Counter.updateOne({
			where: { id: { eq: counter.id } },
			data: { n: { increment: 1 } },
		}).catch((error: unknown) => error)
		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({ code: 'RUNTIME_CALLBACK_RECURSION' })
		expect((failure as Error).message).toContain(
			'HookDataCounter.update-one -> HookDataCounter.update-one',
		)
		await expect(
			Counter.findOne({ where: { id: { eq: counter.id } } }),
		).resolves.toMatchObject({ n: 0 })
	})
})

describe('afterCommit and events (ADR-0318)', () => {
	it('answers before afterCommit runs, then runs global, all and create', async () => {
		let release: () => void = () => undefined
		holdAfterCommit = new Promise((resolve) => {
			release = resolve
		})
		await Todo.createOne({ data: { title: 'Held' } })
		expect(trace).not.toContain('commit:create:Held')

		release()
		await waitForAfterCommit()
		// The event consumer's own Note write commits its own after-commit work.
		expect(
			trace.filter(
				(line) => line.startsWith('commit:') && !line.includes('HookDataNote'),
			),
		).toStrictEqual([
			'commit:global:HookDataTodo:create',
			'commit:all:create',
			'commit:create:Held',
		])
	})

	it('runs one afterCommit per row of a bulk call, after the whole commit', async () => {
		await Todo.createMany({
			data: [{ title: 'Bulk one' }, { title: 'Bulk two' }],
		})
		await waitForAfterCommit()
		expect(
			trace.filter((line) => line.startsWith('commit:create')),
		).toStrictEqual(['commit:create:Bulk one', 'commit:create:Bulk two'])
	})

	it('logs an afterCommit failure without rejecting the call or the next hooks', async () => {
		await expect(
			Todo.createOne({ data: { title: 'fail commit' } }),
		).resolves.toMatchObject({ title: 'fail commit' })
		await waitForAfterCommit()
		expect(logger.messages('error')).toContainEqual(
			expect.stringContaining('afterCommit hook failed after commit'),
		)
		await expect(
			Todo.findOne({ where: { title: { eq: 'fail commit' } } }),
		).resolves.not.toBeNull()
	})

	it('delivers events after commit, logs a consumer failure and ignores an event without consumers', async () => {
		await Todo.createOne({ data: { title: 'Evented' } })
		await waitForAfterCommit()
		expect(trace.filter((line) => line.startsWith('event:'))).toStrictEqual([
			'event:first:Evented',
			'event:second:Evented:true',
		])
		expect(logger.messages('error')).toContainEqual(
			expect.stringContaining('event hook failed after commit'),
		)
		await expect(
			Note.findOne({ where: { body: { eq: 'event:Evented' } } }),
		).resolves.not.toBeNull()
	})

	it('discards afterCommit work and events of a rolled-back transaction', async () => {
		await expect(
			Counter.createOne({ data: {} }).then((counter) =>
				Counter.updateOne({
					where: { id: { eq: counter.id } },
					data: { n: { increment: 1 } },
				}),
			),
		).rejects.toMatchObject({ code: 'RUNTIME_CALLBACK_RECURSION' })
		await waitForAfterCommit()
		expect(trace.filter((line) => line.startsWith('commit:'))).toStrictEqual([
			'commit:global:HookDataCounter:create',
		])
	})
})
