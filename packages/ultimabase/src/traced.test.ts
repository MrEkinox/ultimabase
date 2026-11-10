// The tracing channels (D-360): the message of each operation, hook, virtual
// and function, their nesting, and the errors the server logs.
import { AsyncLocalStorage } from 'node:async_hooks'
import { channel, tracingChannel } from 'node:diagnostics_channel'
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Logger, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { query } from './engine.ts'

const M = { as: master }
const anId: unknown = expect.any(String)
const me = '00000000-0000-4000-8000-000000000000'
let failing = false

interface Watch extends PluginTypes {
	readonly name: 'watch'
}
const watch = definePlugin<Watch>({
	name: 'watch',
	manifest: {
		name: 'watch',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	hooks: { beforeFind: () => undefined },
})

const Post = defineModel({
	name: 'Post',
	use: [watch.use()],
	fields: (f) => ({
		title: f.string(),
		shout: f.virtual(z.string(), { needs: ['title'] }),
	}),
}).with({
	access: { read: () => true },
	virtuals: { shout: { run: ({ record }) => record.title.toUpperCase() } },
	hooks: {
		beforeFind: () => undefined,
		afterCreateCommit: () => {
			if (failing) throw new Error('The mail is down.')
		},
	},
})

const countPosts = defineFunction({
	name: 'countPosts',
	output: z.number(),
	run: async () => Post.count({}, M),
})

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

const names = ['operation', 'hook', 'virtual', 'function'] as const
type Seen = { readonly on: string; readonly message: object }

/** The messages published at the start of each traced work, in order. */
function listen(): Seen[] {
	const seen: Seen[] = []
	for (const name of names) {
		const handler = (message: unknown): void => {
			if (typeof message === 'object' && message !== null) {
				seen.push({ on: name, message: { ...message } })
			}
		}
		tracingChannel(`ultimabase:${name}`).start.subscribe(handler)
		stops.push(() => {
			tracingChannel(`ultimabase:${name}`).start.unsubscribe(handler)
		})
	}
	return seen
}

const stops: (() => void)[] = []

describe('the tracing channels', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		failing = false
		app = defineApp({
			database: memory(),
			models: [Post],
			functions: [countPosts],
			plugins: [watch.plugin()],
			logger: silent,
		})
		await app.start()
		await Post.create({ data: { title: 'hi' } }, M)
	})
	afterEach(async () => {
		for (const stop of stops.splice(0)) stop()
		await app.stop()
	})

	it('publish each operation with its model and caller', async () => {
		const seen = listen()
		const caller = asUser({ id: me })
		await Post.findMany({}, { as: caller })
		expect(seen[0]).toStrictEqual({
			on: 'operation',
			message: { model: 'Post', operation: 'findMany', caller },
		})
	})

	it('name the transports’ upsert an upsert', async () => {
		const seen = listen()
		await query(
			'Post',
			'upserted',
			{ where: { id: me }, create: { title: 'new' }, update: {} },
			M,
		)
		expect(seen[0]?.message).toMatchObject({ operation: 'upsert' })
	})

	it('publish each hook with the plugin that declares it', async () => {
		const seen = listen()
		await Post.findMany({}, M)
		expect(seen.filter(({ on }) => on === 'hook')).toStrictEqual([
			{
				on: 'hook',
				message: { model: 'Post', hook: 'beforeFind', plugin: 'watch' },
			},
			{
				on: 'hook',
				message: { model: 'Post', hook: 'beforeFind', plugin: undefined },
			},
		])
	})

	it('publish each virtual with the rows it computes', async () => {
		await Post.create({ data: { title: 'ho' } }, M)
		const seen = listen()
		await Post.findMany({ select: { shout: true } }, M)
		expect(seen.filter(({ on }) => on === 'virtual')).toStrictEqual([
			{ on: 'virtual', message: { model: 'Post', field: 'shout', rows: 2 } },
		])
	})

	it('publish each function with its caller', async () => {
		const seen = listen()
		await countPosts.run(M)
		expect(seen[0]).toStrictEqual({
			on: 'function',
			message: { name: 'countPosts', caller: master },
		})
	})

	it('nest the work a work starts', async () => {
		const path = new AsyncLocalStorage<readonly string[]>()
		for (const name of names) {
			const start = tracingChannel(`ultimabase:${name}`).start
			start.bindStore(path, () => [...(path.getStore() ?? []), name])
			stops.push(() => start.unbindStore(path))
		}
		const paths: (readonly string[] | undefined)[] = []
		const hook = (): void => {
			paths.push(path.getStore())
		}
		const inner = tracingChannel('ultimabase:hook').start
		inner.subscribe(hook)
		stops.push(() => inner.unsubscribe(hook))
		await countPosts.run(M)
		expect(paths).toStrictEqual([
			['function', 'operation', 'hook'],
			['function', 'operation', 'hook'],
		])
	})

	it('publish an error the server logs, with its correlation id', async () => {
		const seen: unknown[] = []
		const errors = channel('ultimabase:error')
		const handler = (message: unknown): void => {
			seen.push(message)
		}
		errors.subscribe(handler)
		stops.push(() => errors.unsubscribe(handler))
		failing = true
		await Post.create({ data: { title: 'later' } }, M)
		expect(seen).toStrictEqual([
			{
				error: new Error('The mail is down.'),
				correlationId: anId,
				message: 'A commit hook failed; the write is kept.',
			},
		])
	})
})
