// Shared enums (D-150): a frozen name and values that f.enumOf takes in
// place of its values, given to the transports, stored as any enum.
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineEnum,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }

const Status = defineEnum('Status', ['active', 'banned'], {
	description: 'Whether the account can sign in.',
})
const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		status: f.enumOf(Status, { description: 'Its own.' }),
		past: f.enumOf(Status, { list: true }),
		local: f.enumOf(['active', 'banned']),
	}),
})

interface Reader extends PluginTypes {
	readonly name: 'reader'
}
let seen: readonly ExposedModel[] = []
const reader = definePlugin<Reader>({
	name: 'reader',
	manifest: {
		name: 'test-reader',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	start: ({ models }) => {
		seen = models
	},
})
const options = {
	database: memory(),
	plugins: [reader.plugin()],
	models: [Person],
}

describe('a shared enum', () => {
	it('is frozen, its values too', () => {
		expect(Status).toStrictEqual({
			name: 'Status',
			values: ['active', 'banned'],
			description: 'Whether the account can sign in.',
		})
		expect(Object.isFrozen(Status)).toBe(true)
		expect(Object.isFrozen(Status.values)).toBe(true)
		expect(defineEnum('Plain', ['a']).description).toBeUndefined()
	})

	it('types the field of each value, single or a list', async () => {
		const app = defineApp(options)
		await app.start()
		const person = await Person.create(
			{ data: { status: 'active', past: ['banned'], local: 'banned' } },
			M,
		)
		expectTypeOf(person.status).toEqualTypeOf<'active' | 'banned'>()
		expectTypeOf(person.past).toEqualTypeOf<readonly ('active' | 'banned')[]>()
		await expect(
			// @ts-expect-error: a Status is active or banned.
			Person.create({ data: { status: 'gone', local: 'active' } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await app.stop()
	})

	it('is given to the transports and stored as any enum', async () => {
		const app = defineApp(options)
		await app.start()
		const [person] = seen
		expect(person?.enums).toStrictEqual({ status: Status, past: Status })
		expect(person?.descriptions).toStrictEqual({ status: 'Its own.' })
		await app.stop()
		const stored = schemaOf(options).models[0]?.fields
		const status = stored?.find(({ name }) => name === 'status')
		const local = stored?.find(({ name }) => name === 'local')
		expect(status).toStrictEqual({ ...local, name: 'status' })
	})

	it('is a GraphQL name and its values strings, each once', () => {
		for (const name of ['', '1st', '__Status', 'A-B']) {
			expect(() => defineEnum(name, ['a'])).toThrow(
				`defineEnum takes a GraphQL name: letters, digits and _, not ${JSON.stringify(name)}.`,
			)
		}
		expect(() => defineEnum('Empty', [])).toThrow(
			'defineEnum(Empty) takes a list of strings.',
		)
		// @ts-expect-error: values are strings.
		expect(() => defineEnum('Mixed', ['a', 1])).toThrow(
			'defineEnum(Mixed) takes a list of strings.',
		)
		expect(() => defineEnum('Twice', ['a', 'a'])).toThrow(
			'defineEnum(Twice) lists a value twice: a, a.',
		)
		expect(() => defineEnum('Blank', ['a'], { description: '' })).toThrow(
			'defineEnum(Blank): description is a non-empty string.',
		)
	})

	it('is what defineEnum returns, not a look-alike', () => {
		expect(() =>
			defineModel({
				name: 'Fake',
				fields: (f) => ({
					status: f.enumOf({ ...Status }),
				}),
			}),
		).toThrow('enumOf takes a list of strings.')
	})
})
