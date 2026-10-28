// Counts and sorts through relations in the contract (D-134): `_count` at
// any depth and filtered, a sort through `one` relations or by a count, on
// the rows the caller reads, a cursor kept exact.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }
const user = { as: suiteUser('00000000-0000-4000-8000-000000000000') }
const open = () => true

const Firm = defineModel({
	name: 'Firm',
	fields: (f) => ({ name: f.string(), authors: f.many(() => Author) }),
}).with({ access: { read: open } })

/** A user reads the authors who are not retired. */
const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string(),
		retired: f.boolean({ default: false }),
		firm: f.one(() => Firm, { optional: true }),
		articles: f.many(() => Article),
	}),
}).with({ access: { read: ({ where }) => where({ retired: false }) } })

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string({ unique: true }),
		author: f.one(() => Author, { optional: true }),
		remarks: f.many(() => Remark),
		labels: f.many(() => Label),
	}),
}).with({ access: { read: open } })

/** A user reads the remarks that are not hidden. */
const Remark = defineModel({
	name: 'Remark',
	fields: (f) => ({
		body: f.string(),
		hidden: f.boolean({ default: false }),
		article: f.one(() => Article, { onDelete: 'cascade' }),
	}),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

const Label = defineModel({
	name: 'Label',
	fields: (f) => ({ text: f.string(), articles: f.many(() => Article) }),
}).with({ access: { read: open } })

const titles = (rows: readonly { readonly title: string }[]): string[] =>
	rows.map((row) => row.title)

const connect = (id: string) => ({ connect: { id } })

/** The articles' titles, by their author's firm name, then their title. */
const byFirm = async (direction: 'asc' | 'desc', as = M) =>
	titles(
		await Article.findMany(
			{
				orderBy: [{ author: { firm: { name: direction } } }, { title: 'asc' }],
			},
			as,
		),
	)

export function counts(create: () => Adapter): void {
	describe('counts and sorts through relations', () => {
		started(create, [Firm, Author, Article, Remark, Label])

		let ada = ''
		beforeEach(async () => {
			const zeta = await Firm.create({ data: { name: 'Zeta' } }, M)
			const acme = await Firm.create({ data: { name: 'Acme' } }, M)
			ada = (
				await Author.create(
					{ data: { name: 'Ada', firm: connect(zeta.id) } },
					M,
				)
			).id
			const bob = await Author.create(
				{ data: { name: 'Bob', retired: true, firm: connect(acme.id) } },
				M,
			)
			await Author.create({ data: { name: 'Cy' } }, M)
			const ts = await Label.create({ data: { text: 'ts' } }, M)
			const go = await Label.create({ data: { text: 'go' } }, M)
			const article = async (
				title: string,
				author: string | undefined,
				remarks: readonly { body: string; hidden?: boolean }[],
				labels: readonly string[],
			) =>
				Article.create(
					{
						data: {
							title,
							...(author === undefined ? {} : { author: connect(author) }),
							remarks: { create: remarks },
							labels: { connect: labels.map((id) => ({ id })) },
						},
					},
					M,
				)
			const hidden = true
			await article(
				'One',
				ada,
				[{ body: 'r1' }, { body: 'r2', hidden }, { body: 'x', hidden }],
				[ts.id, go.id],
			)
			await article('Two', bob.id, [], [ts.id])
			await article('Three', ada, [{ body: 'r3' }, { body: 'r4' }], [])
			await article('Four', undefined, [], [])
		})

		it('counts every many relation, or the ones it names, filtered', async () => {
			const authors = await Author.findMany(
				{ orderBy: { name: 'asc' }, include: { _count: true } },
				M,
			)
			expect(authors.map((row) => [row.name, row._count])).toEqual([
				['Ada', { articles: 2 }],
				['Bob', { articles: 1 }],
				['Cy', { articles: 0 }],
			])
			const articles = await Article.findMany(
				{
					orderBy: { title: 'asc' },
					select: {
						title: true,
						_count: {
							select: {
								remarks: { where: { body: { startsWith: 'r' } } },
								labels: true,
							},
						},
					},
				},
				M,
			)
			expect(articles).toEqual([
				{ title: 'Four', _count: { remarks: 0, labels: 0 } },
				{ title: 'One', _count: { remarks: 2, labels: 2 } },
				{ title: 'Three', _count: { remarks: 2, labels: 0 } },
				{ title: 'Two', _count: { remarks: 0, labels: 1 } },
			])
		})

		it('counts at any depth, the rows the caller reads', async () => {
			const args = {
				where: { id: ada },
				include: {
					articles: {
						orderBy: { title: 'asc' },
						include: { _count: { select: { remarks: true } } },
					},
				},
			} as const
			const counted = async (as: typeof M) =>
				(await Author.findUnique(args, as))?.articles.map((row) => [
					row.title,
					row._count.remarks,
				])
			expect(await counted(M)).toEqual([
				['One', 3],
				['Three', 2],
			])
			expect(await counted(user)).toEqual([
				['One', 1],
				['Three', 2],
			])
		})

		it('sorts through one relations, an absent row last ascending', async () => {
			expect(await byFirm('asc')).toEqual(['Two', 'One', 'Three', 'Four'])
			expect(await byFirm('desc')).toEqual(['Four', 'One', 'Three', 'Two'])
			// Bob, whom a user does not read, sorts as an absent author.
			expect(await byFirm('asc', user)).toEqual(['One', 'Three', 'Four', 'Two'])
		})

		it('sorts by a count of the rows the caller reads', async () => {
			const by = async (as: typeof M) =>
				titles(
					await Article.findMany(
						{
							where: { remarks: { some: {} } },
							orderBy: { remarks: { _count: 'desc' } },
						},
						as,
					),
				)
			expect(await by(M)).toEqual(['One', 'Three'])
			expect(await by(user)).toEqual(['Three', 'One'])
			const authors = await Author.findMany(
				{ orderBy: [{ articles: { _count: 'desc' } }, { name: 'asc' }] },
				M,
			)
			expect(authors.map((row) => row.name)).toEqual(['Ada', 'Bob', 'Cy'])
		})

		it('pages exactly from a cursor through a relation sort', async () => {
			const orderBy = [
				{ author: { name: 'desc' } },
				{ remarks: { _count: 'asc' } },
			] as const
			const all = titles(await Article.findMany({ orderBy }, M))
			expect(all).toEqual(['Four', 'Two', 'Three', 'One'])
			const rows = await Article.findMany({ orderBy }, M)
			for (const [at, row] of rows.entries()) {
				const cursor = { id: row.id }
				const after = await Article.findMany({ orderBy, cursor, take: 2 }, M)
				expect(titles(after)).toEqual(all.slice(at, at + 2))
				const before = await Article.findMany({ orderBy, cursor, take: -2 }, M)
				expect(titles(before)).toEqual(all.slice(Math.max(0, at - 1), at + 1))
			}
		})
	})
}
