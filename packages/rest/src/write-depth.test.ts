// The deepest write over REST (D-350): the transport reads 32 levels, dates
// included, and leaves deeper rows as they are for the kernel to refuse.
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rest } from './index.ts'
import type { Sent } from './test/app.ts'
import { call, M, started } from './test/app.ts'

const Node = defineModel({
	name: 'Node',
	use: [rest()],
	fields: (f) => ({
		label: f.string(),
		on: f.dateTime({ optional: true }),
		parent: f.one(() => Node, { optional: true }),
	}),
}).with({ access: allow.public })
const Comment = defineModel({
	name: 'Comment',
	use: [rest()],
	fields: (f) => ({
		on: f.oneOf({ comment: () => Comment, page: () => Page }),
		replies: f.many(() => Comment, { inverse: 'on' }),
	}),
}).with({ access: allow.public })
const Page = defineModel({
	name: 'Page',
	use: [rest()],
	fields: (f) => ({ comments: f.many(() => Comment, { inverse: 'on' }) }),
}).with({ access: allow.public })

let running: Awaited<ReturnType<typeof started>>
beforeAll(async () => {
	running = await started({}, memory(), [], [Node, Comment, Page])
})
afterAll(async () => running.app.stop())

type Data = { [field: string]: unknown }

/** A row `levels` deep, each row creating the one above it. */
function parents(levels: number): Data {
	let data: Data = { label: 'top', on: '2026-01-02T03:04:05.000Z' }
	for (let level = 1; level < levels; level += 1) {
		data = { label: `${level}`, parent: { create: data } }
	}
	return data
}

/** A body sent as text: `JSON.stringify` would itself run out of stack. */
const raw = async (path: string, body: string): Promise<Sent> => {
	const response = await fetch(`${running.url}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
	})
	return { status: response.status, body: await response.json() }
}

const refused = (steps: readonly string[]): Sent => {
	const path = ['data', ...steps].join('.')
	return {
		status: 400,
		body: {
			code: 'BAD_USER_INPUT',
			message: `${path}: the write is nested more than 32 levels deep.`,
			details: { path },
		},
	}
}
const repeated = (step: string) => Array.from({ length: 32 }, () => step)

describe('a write nested too deep', () => {
	it('nests 32 levels, its dates read, and is refused at the 33rd', async () => {
		const sent = await call(running.url, 'POST', '/api/nodes', {
			body: parents(32),
		})
		expect(sent.status).toBe(201)
		const top = await Node.findFirst({ where: { label: 'top' } }, M)
		expect(top?.on).toStrictEqual(new Date('2026-01-02T03:04:05.000Z'))
		expect(
			await call(running.url, 'POST', '/api/nodes', { body: parents(33) }),
		).toStrictEqual(refused(repeated('parent.create')))
	})

	it('reads a body thousands of levels deep without running out of stack', async () => {
		const levels = 20_000
		const nodes = `${'{"label":"n","parent":{"create":'.repeat(levels)}{"label":"top"}${'}}'.repeat(levels)}`
		expect(await raw('/api/nodes', nodes)).toStrictEqual(
			refused(repeated('parent.create')),
		)
		const thread = `${'{"on":{"create":{"comment":'.repeat(levels)}{}${'}}}'.repeat(levels)}`
		expect(await raw('/api/comments', thread)).toStrictEqual(
			refused(repeated('on.create.comment')),
		)
	})
})
