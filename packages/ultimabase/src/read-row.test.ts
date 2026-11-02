// A field a read rule may hide is optional in the rows a query returns
// (D-199): the row leaves it out, and its type says so.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { asUser } from '@ultimabase/testing'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	master,
	memory,
} from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({
		name: f.string(),
		status: f.enumOf(['draft', 'published']),
		phone: f
			.string({ optional: true })
			.with({ access: { read: ({ caller }) => caller.kind === 'master' } }),
		title: f.string().with<{ status: 'draft' | 'published' }>({
			access: { read: ({ record }) => record.status === 'published' },
		}),
		secret: f.string({ default: 's' }).with({ access: allow.private }),
		open: f.string({ default: 'o' }).with({ access: allow.readOnly }),
		shown: f
			.string({ default: 'p' })
			.with({ access: { read: allow.public, write: allow.private } }),
		body: f.string({ default: 'b' }).with<{ status: 'draft' | 'published' }>({
			access: { update: ({ record }) => record.status === 'draft' },
		}),
		notes: f.many(() => Note, { inverse: 'account' }),
		shares: f.many(() => Note, { inverse: 'shared' }),
	}),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		account: f
			.one(() => Account, { inverse: 'notes' })
			.with({ access: { read: ({ caller }) => caller.kind === 'master' } }),
		shared: f
			.one(() => Account, { optional: true, inverse: 'shares' })
			.with({ access: { update: allow.private } }),
	}),
}).with({ access: allow.public })

const first = defineFunction({
	name: 'first',
	output: Account,
	// A row as a caller reads it is a valid output.
	run: async ({ caller }) => Account.findFirstOrThrow({}, { as: caller }),
}).with({ access: allow.public })

let app: { start(): Promise<void>; stop(): Promise<void> }
beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Account, Note],
		functions: [first],
	})
	await app.start()
	const account = await Account.create(
		{ data: { name: 'Ada', status: 'draft', title: 'Hi', phone: '1' } },
		M,
	)
	await Note.create(
		{ data: { text: 'n', account: { connect: { id: account.id } } } },
		M,
	)
})
afterEach(async () => {
	await app.stop()
})

describe('a field with a read rule', () => {
	it('is optional in a row, and left out when the rule hides it', async () => {
		const row = await Account.findFirstOrThrow({}, ada)
		expectTypeOf(row.name).toEqualTypeOf<string>()
		expectTypeOf(row.phone).toEqualTypeOf<string | null | undefined>()
		expectTypeOf(row.title).toEqualTypeOf<string | undefined>()
		expectTypeOf(row.secret).toEqualTypeOf<string | undefined>()
		expect(row).not.toHaveProperty('phone')
		expect(row).not.toHaveProperty('title')
		expect(row).not.toHaveProperty('secret')
	})

	it('is optional for Master too, who reads it', async () => {
		const row = await Account.findFirstOrThrow({}, M)
		expectTypeOf(row.title).toEqualTypeOf<string | undefined>()
		expect(row).toMatchObject({ phone: '1', title: 'Hi', secret: 's' })
	})

	it('is optional in a select and a nested select', async () => {
		const rows = await Note.findMany(
			{
				select: {
					text: true,
					account: { select: { name: true, title: true } },
				},
			},
			M,
		)
		expectTypeOf(rows).toEqualTypeOf<
			({ readonly text: string } & {
				readonly account?:
					({ readonly name: string } & { readonly title?: string }) | null
			})[]
		>()
		expect(rows).toEqual([{ text: 'n', account: { name: 'Ada', title: 'Hi' } }])
		const hidden = await Note.findMany({ select: { account: true } }, ada)
		expect(hidden).toEqual([{}])
	})

	it('is optional in a page and in a function output', async () => {
		const [node] = await Account.paginate({}, ada).findMany()
		expectTypeOf(node?.title).toEqualTypeOf<string | undefined>()
		expect(node).not.toHaveProperty('title')
		const row = await first.run(ada)
		expect(row).not.toHaveProperty('title')
	})
})

describe('a field without a read rule stays required', () => {
	it('with allow.public, allow.readOnly or a write rule only', async () => {
		const row = await Account.findFirstOrThrow({}, ada)
		expectTypeOf(row.open).toEqualTypeOf<string>()
		expectTypeOf(row.shown).toEqualTypeOf<string>()
		expectTypeOf(row.body).toEqualTypeOf<string>()
		expect(row).toMatchObject({ open: 'o', shown: 'p', body: 'b' })
		const [note] = await Note.findMany({ include: { shared: true } }, ada)
		expectTypeOf<NonNullable<typeof note>['shared']>().not.toBeUndefined()
	})
})
