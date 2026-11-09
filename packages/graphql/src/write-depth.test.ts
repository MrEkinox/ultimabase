// The deepest write over GraphQL (D-350): 32 levels, the 33rd refused as the
// kernel refuses it, variables too deep for graphql-js refused as D-228's.
import { allow, defineModel } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { at, post, started } from './test/app.ts'

const Node = defineModel({
	name: 'Node',
	use: [graphql()],
	fields: (f) => ({
		label: f.string(),
		parent: f.one(() => Node, { optional: true }),
	}),
}).with({ access: allow.public })

let url = ''
let stop: (() => Promise<void>) | undefined
beforeAll(async () => {
	const running = await started({}, undefined, [], [], [Node])
	url = `${running.url}/graphql`
	stop = async () => running.app.stop()
})
afterAll(async () => stop?.())

const create =
	'mutation ($data: NodeCreateInput!) { createNode(data: $data) { label } }'

/** A row `levels` deep, as JSON text: JSON.stringify runs out of stack. */
const parents = (levels: number) =>
	`${'{"label":"n","parent":{"create":'.repeat(levels - 1)}{"label":"top"}${'}}'.repeat(levels - 1)}`

async function sent(data: string): Promise<unknown> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: `{"query":${JSON.stringify(create)},"variables":{"data":${data}}}`,
	})
	return response.json()
}
const refused = (message: string) => [
	{ message, extensions: { code: 'BAD_USER_INPUT' } },
]

describe('a write nested too deep (D-350)', () => {
	it('nests 32 levels, and is refused at the 33rd', async () => {
		expect(await sent(parents(32))).toStrictEqual({
			data: { createNode: { label: 'n' } },
		})
		const path = ['data', ...Array.from({ length: 32 }, () => 'parent.create')]
		expect(at(await sent(parents(33)), 'errors')).toMatchObject(
			refused(
				`${path.join('.')}: the write is nested more than 32 levels deep.`,
			),
		)
	})

	it('is refused when graphql-js runs out of stack reading it', async () => {
		expect(at(await sent(parents(20_000)), 'errors')).toStrictEqual(
			refused('The variables are nested too deep.'),
		)
		// The application still answers.
		expect(await post(url, '{ nodes { totalCount } }')).toStrictEqual({
			data: { nodes: { totalCount: 32 } },
		})
	})
})
