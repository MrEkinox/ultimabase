// The Sentry plugin with Sentry 11 (D-361): the spans of a request, nested,
// an issue per error the server masks, and none for an answer.
import { channel, tracingChannel } from 'node:diagnostics_channel'
import { getAsyncContextStrategy, getMainCarrier } from '@sentry/core'
import type { Event } from '@sentry/node'
import * as Sentry from '@sentry/node'
import { asUser } from '@ultimabase/testing'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import { z } from 'zod'
import { sentryPlugin } from './index.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const anId: unknown = expect.any(String)
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

type Streamed = Parameters<NonNullable<Sentry.NodeOptions['beforeSendSpan']>>[0]

const issues: Event[] = []
const sent: Streamed[] = []
const warnings: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (...line: unknown[]) => {
		warnings.push(line.at(-1))
	},
	error: () => undefined,
	child: () => logger,
}

beforeAll(() => {
	Sentry.init({
		dsn: 'https://key@sentry.invalid/1',
		defaultIntegrations: false,
		tracesSampleRate: 1,
		transport: (options) => Sentry.createTransport(options, async () => ({})),
		beforeSend: (event) => {
			issues.push(event)
			return null
		},
		beforeSendSpan: (span) => {
			sent.push(span)
			return span
		},
	})
})

type Seen = {
	readonly op: unknown
	readonly name: string
	readonly parent: string | undefined
}

/** The spans `work` makes in a request, by name, as `op name ← parent`. */
async function trace(work: () => Promise<unknown>): Promise<Seen[]> {
	sent.length = 0
	await Sentry.startSpan({ name: 'request' }, work)
	await Sentry.flush()
	const names = new Map(sent.map((span) => [span.span_id, span.name]))
	return sent
		.filter((span) => !span.is_segment)
		.map((span) => ({
			op: span.attributes['sentry.op'],
			name: span.name,
			parent: names.get(span.parent_span_id ?? ''),
		}))
		.toSorted((one, other) => one.name.localeCompare(other.name))
}

/** The span last sent named `name`. */
function spanNamed(name: string): Streamed | undefined {
	return sent.find((span) => span.name === name)
}

let app: ReturnType<typeof defineApp>
const start = async (): Promise<void> => {
	app = defineApp({
		database: memory(),
		models: [Post],
		functions: [countPosts],
		plugins: [watch.plugin(), sentryPlugin()],
		logger,
	})
	await app.start()
}

describe('sentryPlugin', () => {
	beforeEach(async () => {
		failing = false
		issues.length = 0
		warnings.length = 0
		await start()
		await Post.create({ data: { title: 'hi' } }, M)
	})
	afterEach(async () => {
		await app.stop()
	})

	it('nest a query’s hooks and virtuals under it, in the request', async () => {
		const spans = await trace(async () =>
			Post.findMany({ select: { shout: true } }, { as: asUser({ id: me }) }),
		)
		expect(spans).toStrictEqual([
			{
				op: 'ultimabase.hook',
				name: 'Post.beforeFind',
				parent: 'Post.findMany',
			},
			{
				op: 'ultimabase.hook',
				name: 'Post.beforeFind (watch)',
				parent: 'Post.findMany',
			},
			{ op: 'ultimabase.operation', name: 'Post.findMany', parent: 'request' },
			{ op: 'ultimabase.virtual', name: 'Post.shout', parent: 'Post.findMany' },
		])
		expect(spanNamed('Post.findMany')).toMatchObject({
			attributes: {
				'ultimabase.model': 'Post',
				'ultimabase.operation': 'findMany',
				'ultimabase.caller': `user:${me}`,
			},
		})
		expect(spanNamed('Post.beforeFind (watch)')).toMatchObject({
			attributes: { 'ultimabase.plugin': 'watch' },
		})
		expect(spanNamed('Post.shout')).toMatchObject({
			attributes: { 'ultimabase.field': 'shout', 'ultimabase.rows': 1 },
		})
	})

	it('nest a function’s queries under it', async () => {
		const spans = await trace(async () => countPosts.run(M))
		expect(spans).toStrictEqual([
			{ op: 'ultimabase.function', name: 'countPosts', parent: 'request' },
			{ op: 'ultimabase.hook', name: 'Post.beforeFind', parent: 'Post.count' },
			{
				op: 'ultimabase.hook',
				name: 'Post.beforeFind (watch)',
				parent: 'Post.count',
			},
			{ op: 'ultimabase.operation', name: 'Post.count', parent: 'countPosts' },
		])
		expect(spanNamed('countPosts')).toMatchObject({
			attributes: {
				'ultimabase.function': 'countPosts',
				'ultimabase.caller': 'master',
			},
		})
	})

	it('make no span outside a trace', async () => {
		sent.length = 0
		await Post.findMany({}, M)
		await Sentry.flush()
		expect(sent).toStrictEqual([])
	})

	it('make an issue of an error the server masks, with its id', async () => {
		failing = true
		await Post.create({ data: { title: 'later' } }, M)
		await Sentry.flush()
		expect(issues).toHaveLength(1)
		expect(issues[0]).toMatchObject({
			exception: { values: [{ value: 'The mail is down.' }] },
			tags: { correlationId: anId },
			extra: { message: 'A commit hook failed; the write is kept.' },
		})
	})

	it('mark the span of a NOT_FOUND failed, and make no issue of it', async () => {
		await trace(async () =>
			Post.findUniqueOrThrow({ where: { id: me } }, M).catch(() => null),
		)
		expect(spanNamed('Post.findUniqueOrThrow')).toMatchObject({
			status: 'error',
			attributes: { 'error.type': 'NOT_FOUND' },
		})
		expect(issues).toStrictEqual([])
	})

	it('ignore what is not an error the kernel published', async () => {
		const errors = channel('ultimabase:error')
		const error = new Error('stray')
		for (const message of [
			'text',
			null,
			{ correlationId: 'a', message: 'b' },
			{ error, message: 'b' },
			{ error, correlationId: 'a' },
			{ error, correlationId: 1, message: 'b' },
			{ error, correlationId: 'a', message: 1 },
		]) {
			errors.publish(message)
		}
		await Sentry.flush()
		expect(issues).toStrictEqual([])
	})

	it('stop reading the channels when the app stops', async () => {
		await app.stop()
		const read = ['operation', 'hook', 'virtual', 'function'].map(
			(kind) => tracingChannel(`ultimabase:${kind}`).hasSubscribers,
		)
		expect([...read, channel('ultimabase:error').hasSubscribers]).toStrictEqual(
			[false, false, false, false, false],
		)
		await start()
	})
})

// What `Sentry.init` set, after it ran.
const strategy = () => getAsyncContextStrategy(getMainCarrier())

describe('sentryPlugin without Sentry’s store', () => {
	let binding: ReturnType<typeof strategy>['getTracingChannelBinding']
	beforeEach(async () => {
		warnings.length = 0
		binding = strategy().getTracingChannelBinding
		delete strategy().getTracingChannelBinding
		await start()
	})
	afterEach(async () => {
		if (binding !== undefined) strategy().getTracingChannelBinding = binding
		await app.stop()
	})

	it('make flat spans, and say why', async () => {
		const spans = await trace(async () => countPosts.run(M))
		expect(spans).toStrictEqual([
			{ op: 'ultimabase.function', name: 'countPosts', parent: 'request' },
			{ op: 'ultimabase.hook', name: 'Post.beforeFind', parent: 'request' },
			{
				op: 'ultimabase.hook',
				name: 'Post.beforeFind (watch)',
				parent: 'request',
			},
			{ op: 'ultimabase.operation', name: 'Post.count', parent: 'request' },
		])
		expect(warnings).toStrictEqual([
			'Sentry’s spans of UltimaBase are flat: the application has two versions of @sentry/core; deduplicate them.',
		])
	})
})

describe('sentryPlugin without Sentry.init', () => {
	let client: ReturnType<typeof Sentry.getClient>
	beforeEach(() => {
		warnings.length = 0
		client = Sentry.getClient()
		Sentry.getCurrentScope().setClient(undefined)
	})
	afterEach(async () => {
		vi.unstubAllEnvs()
		Sentry.getCurrentScope().setClient(client)
		await app.stop()
	})

	it('warn outside tests, and read nothing', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		await start()
		expect(warnings).toStrictEqual([
			'Sentry is not initialized: call Sentry.init before the app starts.',
		])
		expect(channel('ultimabase:error').hasSubscribers).toBe(false)
	})

	it('stay silent in tests', async () => {
		await start()
		expect(warnings).toStrictEqual([])
	})
})
