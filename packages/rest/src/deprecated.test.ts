// Deprecated in the OpenAPI document (D-216): `deprecated: true` and the
// reason ending the description, on a property of the row, the filter, the
// sort and the data inputs, and on a function's operation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { allow, defineFunction, defineModel, memory } from 'ultimabase'
import { rest } from './index.ts'
import { at, call, started } from './test/app.ts'

const Person = defineModel({
	name: 'Person',
	use: [rest()],
	fields: (f) => ({
		displayName: f.string(),
		name: f.string({ optional: true, deprecated: 'Use displayName.' }),
		rank: f.number({
			default: 0,
			description: 'Its place.',
			deprecated: 'Use order.',
		}),
		shout: f.virtual(z.string(), {
			needs: ['displayName'],
			deprecated: 'Upper-case it.',
		}),
	}),
}).with({
	access: allow.public,
	virtuals: {
		shout: { run: ({ record }) => record.displayName.toUpperCase() },
	},
})

const legacySearch = defineFunction({
	name: 'legacySearch',
	deprecated: 'Use search.',
	query: true,
	output: z.number(),
	run: () => 0,
}).with({ access: allow.public })
const legacyNote = defineFunction({
	name: 'legacyNote',
	description: 'Notes a thing.',
	deprecated: 'Use note.',
	run: () => {},
}).with({ access: allow.public })

let document: unknown
let stop: (() => Promise<void>) | undefined
beforeAll(async () => {
	const running = await started(
		{},
		memory(),
		[legacySearch, legacyNote],
		[Person],
	)
	stop = async () => running.app.stop()
	document = (await call(running.url, 'GET', '/api/openapi.json')).body
})
afterAll(async () => stop?.())

/** Each deprecated property's description, by property. */
const deprecatedOf = (name: string): { [property: string]: unknown } => {
	const properties = at(document, 'components', 'schemas', name, 'properties')
	if (typeof properties !== 'object' || properties === null) return {}
	return Object.fromEntries(
		Object.entries(properties)
			.filter(([, value]) => at(value, 'deprecated') === true)
			.map(([property, value]) => [property, at(value, 'description')]),
	)
}

const person = {
	name: 'Deprecated: Use displayName.',
	rank: 'Its place.\n\nDeprecated: Use order.',
}

describe('deprecated in the OpenAPI document', () => {
	it('is on the properties of the row, the filter, the sort and the data', () => {
		expect(deprecatedOf('Person')).toStrictEqual({
			...person,
			shout: 'Deprecated: Upper-case it.',
		})
		for (const input of ['PersonCreateInput', 'PersonUpdateInput']) {
			expect(deprecatedOf(input)).toStrictEqual(person)
		}
		// Neither a filter nor a sort has a description (D-150).
		for (const input of ['PersonWhereInput', 'PersonOrderByInput']) {
			expect(deprecatedOf(input)).toStrictEqual({
				name: person.name,
				rank: 'Deprecated: Use order.',
			})
		}
	})

	it('is on a function operation', () => {
		expect(
			at(document, 'paths', '/functions/legacySearch', 'get'),
		).toMatchObject({
			deprecated: true,
			description: 'Deprecated: Use search.',
		})
		expect(
			at(document, 'paths', '/functions/legacyNote', 'post'),
		).toMatchObject({
			deprecated: true,
			description: 'Notes a thing.\n\nDeprecated: Use note.',
		})
	})
})
