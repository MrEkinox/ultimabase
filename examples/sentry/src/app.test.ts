// Sentry initialized as the application does, its spans and issues kept in
// memory instead of sent.
import { channel } from 'node:diagnostics_channel'
import * as Sentry from '@sentry/node'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import { app, Post } from './app.ts'
import { mailer } from './services.ts'

type Span = Parameters<NonNullable<Sentry.NodeOptions['beforeSendSpan']>>[0]
const spans: Span[] = []
const anId: unknown = expect.any(String)
const issues: Sentry.Event[] = []

beforeAll(() => {
	Sentry.init({
		dsn: 'https://key@sentry.invalid/1',
		tracesSampleRate: 1,
		// The tests share a process: no handler of Node's own events.
		defaultIntegrations: false,
		//#region init
		// Nothing leaves the test: each span and issue is kept.
		transport: (options) => Sentry.createTransport(options, async () => ({})),
		beforeSendSpan: (span) => {
			spans.push(span)
			return span
		},
		beforeSend: (event) => {
			issues.push(event)
			return null
		},
		//#endregion
	})
})
testApplication(app)

beforeEach(() => {
	spans.length = 0
	issues.length = 0
	mailer.down = false
	mailer.sent.length = 0
})

it('nests the queries and hooks of a request in its trace', async () => {
	//#region trace
	await Sentry.startSpan({ name: 'POST /posts' }, async () =>
		Post.create({ data: { title: 'Hello' } }, { as: master }),
	)
	await Sentry.flush()
	// Each span's name, and its parent's.
	const parent = (span: Span) =>
		spans.find(({ span_id }) => span_id === span.parent_span_id)?.name
	expect(spans.map((span) => [span.name, parent(span)])).toEqual([
		['Post.afterCreateCommit', 'Post.create'],
		['Post.create', 'POST /posts'],
		['POST /posts', undefined],
	])
	//#endregion
})

it('makes an issue of a failed mail, with its correlation id', async () => {
	//#region issue
	mailer.down = true
	// The post is kept: the hook runs after the commit.
	await Post.create({ data: { title: 'Hello' } }, { as: master })
	await Sentry.flush()
	expect(issues).toMatchObject([
		{
			exception: { values: [{ value: 'The mail service is down.' }] },
			// The id of the server's log line, to find it.
			tags: { correlationId: anId },
		},
	])
	//#endregion
})

it('makes no issue of an answer, as a row not found', async () => {
	const missing = { where: { id: '00000000-0000-4000-8000-000000000000' } }
	await expect(Post.findUniqueOrThrow(missing, { as: master })).rejects.toThrow(
		'No Post matches.',
	)
	await Sentry.flush()
	expect(issues).toEqual([])
})

it('publishes each failure on a channel another tool can read', async () => {
	mailer.down = true
	//#region channel
	const failures: unknown[] = []
	const record = (message: unknown) => failures.push(message)
	channel('ultimabase:error').subscribe(record)
	await Post.create({ data: { title: 'Hello' } }, { as: master })
	channel('ultimabase:error').unsubscribe(record)
	expect(failures).toEqual([
		{
			error: new Error('The mail service is down.'),
			correlationId: anId,
			message: 'A commit hook failed; the write is kept.',
		},
	])
	//#endregion
})
