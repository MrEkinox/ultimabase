// What a `beforeCreate` hook finds in its draft (D-67, D-279): the fields a
// default has set are typed as set, and they are set on every path.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const seen: unknown[] = []

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({
		locale: f.enumOf(['fr', 'en'], { default: 'fr' }),
		nick: f.string({ optional: true, default: 'anon' }),
		code: f.string({ default: () => 'a' }),
		maybe: f.string({ optional: true, default: () => undefined }),
		tags: f.string({ list: true, default: ['x'] }),
		languages: f.enumOf(['fr', 'en', 'de'], { list: true }),
		title: f.string({ unique: true }),
	}),
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			expectTypeOf(data.locale).toEqualTypeOf<'fr' | 'en'>()
			expectTypeOf(data.nick).toEqualTypeOf<string | null>()
			expectTypeOf(data.code).toEqualTypeOf<string>()
			expectTypeOf(data.tags).toEqualTypeOf<readonly string[]>()
			// A default's function may return nothing, and a list without a
			// default is left to the hook.
			expectTypeOf(data.maybe).toEqualTypeOf<string | null | undefined>()
			expectTypeOf(data.languages).toEqualTypeOf<
				readonly ('fr' | 'en' | 'de')[] | undefined
			>()
			seen.push({ ...data })
			if (data.languages === undefined) data.languages = [data.locale]
		},
	},
})

describe('a beforeCreate draft', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		seen.length = 0
		app = defineApp({ database: memory(), models: [Account] })
		await app.start()
	})
	afterEach(() => app.stop())

	it('holds the defaults on a create, and the hook reads them', async () => {
		const made = await Account.create({ data: { title: 't' } }, M)
		expect(seen[0]).toMatchObject({ locale: 'fr', nick: 'anon', code: 'a' })
		expect(made.languages).toEqual(['fr'])
	})

	it('takes an undefined value as absent', async () => {
		await Account.create(
			{ data: { title: 't', locale: undefined, nick: undefined } },
			M,
		)
		expect(seen[0]).toMatchObject({ locale: 'fr', nick: 'anon' })
	})

	it('holds them on createMany and upsert', async () => {
		await Account.createMany({ data: [{ title: 'a' }] }, M)
		expect(seen[0]).toMatchObject({ locale: 'fr' })
		await Account.upsert(
			{
				where: { title: 'b' },
				create: { title: 'b' },
				update: {},
			},
			M,
		)
		expect(seen[1]).toMatchObject({ locale: 'fr' })
	})
})
