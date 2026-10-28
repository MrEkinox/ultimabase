// Shared enums in the OpenAPI document (D-150): one schema each property
// references, a function schema of its name and values the same one.
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
	allow,
	defineEnum,
	defineFunction,
	defineModel,
	memory,
} from 'ultimabase'
import { rest } from './index.ts'
import { at, call, started } from './test/app.ts'

const Status = defineEnum('Status', ['active', 'banned'], {
	description: 'Whether the account can sign in.',
})
const Person = defineModel({
	name: 'Person',
	use: [rest()],
	fields: (f) => ({
		status: f.enumOf(Status, { description: 'Its own.' }),
		local: f.enumOf(['active', 'banned']),
	}),
}).with({ access: allow.public })
const Team = defineModel({
	name: 'Team',
	use: [rest()],
	fields: (f) => ({ past: f.enumOf(Status, { list: true }) }),
}).with({ access: allow.public })
const ban = defineFunction({
	name: 'ban',
	input: z.object({ to: z.string() }),
	output: z.enum(['active', 'banned']).meta({ id: 'Status' }),
	run: () => 'banned' as const,
}).with({ access: allow.public })

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function documentOf(
	models: Parameters<typeof started>[3],
	functions: Parameters<typeof started>[2] = [],
): Promise<unknown> {
	const running = await started({}, memory(), functions, models)
	stop = async () => running.app.stop()
	return (await call(running.url, 'GET', '/api/openapi.json')).body
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

describe('a shared enum in the OpenAPI document', () => {
	it('is one schema each property and function schema of it references', async () => {
		const document = await documentOf([Person, Team], [ban])
		const schemas = (...path: readonly string[]) =>
			at(document, 'components', 'schemas', ...path)
		expect(schemas('Status')).toStrictEqual({
			type: 'string',
			enum: ['active', 'banned'],
			description: 'Whether the account can sign in.',
		})
		expect(schemas('Person', 'properties', 'status')).toStrictEqual({
			...ref('Status'),
			description: 'Its own.',
		})
		expect(schemas('Person', 'properties', 'local')).toStrictEqual(
			ref('PersonLocal'),
		)
		expect(schemas('Team', 'properties', 'past')).toStrictEqual({
			type: 'array',
			items: ref('Status'),
		})
		expect(schemas('PersonStatus')).toBeUndefined()
		expect(schemas('StatusFilter')).toBeDefined()
		const responses = at(
			document,
			'paths',
			'/functions/ban',
			'post',
			'responses',
		)
		expect(
			at(responses, 200, 'content', 'application/json', 'schema'),
		).toStrictEqual(ref('Status'))
	})

	it('is refused at start when one name has two value lists', async () => {
		const Other = defineEnum('Status', ['active'])
		const Club = defineModel({
			name: 'Club',
			use: [rest()],
			fields: (f) => ({ status: f.enumOf(Other) }),
		}).with({ access: allow.public })
		await expect(documentOf([Person, Club])).rejects.toThrow(
			'Person.status and Club.status give the schema Status two shapes; name each once.',
		)
	})

	it('is refused at start when REST names a schema like it', async () => {
		const Club = defineModel({
			name: 'Club',
			use: [rest()],
			fields: (f) => ({ status: f.enumOf(defineEnum('Person', ['open'])) }),
		}).with({ access: allow.public })
		await expect(documentOf([Person, Club])).rejects.toThrow(
			'Club.status: REST names a schema Person; give yours another name.',
		)
	})
})
