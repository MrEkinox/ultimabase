// A number update computes on the row as it is when the write runs (D-132
// point 3): two decrements that race on one row both count, through the
// locked row a hook reads and through Master's write by id that loads none.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master, PublicError } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	const options = `-c search_path=${schema}`
	return `${url}${separator}options=${encodeURIComponent(options)}`
}

const quiet: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => quiet,
}
const M = { as: master }

// No hook: Master's update by id computes in its write.
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({ stock: f.number({ integer: true }) }),
})

// A hook: the update loads the locked row and computes on it.
const Product = defineModel({
	name: 'Product',
	fields: (f) => ({ stock: f.number({ integer: true }) }),
}).with({
	hooks: {
		beforeUpdate: ({ data }) => {
			if ((data.stock ?? 0) < 0) {
				throw new PublicError('OUT_OF_STOCK', 'Out of stock.')
			}
		},
	},
})

async function waitingOnLock(
	watcher: Client,
	table: string,
	count: number,
): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike $1`,
			[`%"${table}"%`],
		)
		if ((rows[0]?.n ?? 0) >= count) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The writes never waited on the row lock.')
}

for (const url of urls) {
	describe(`two decrements racing on one row on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({
				database,
				models: [Item, Product],
				logger: quiet,
			})
			await app.start()
			other = new Client({ connectionString: inSchema(url, schema) })
			await other.connect()
			watcher = new Client({ connectionString: url })
			await watcher.connect()
		})
		afterEach(async () => {
			await other.end()
			await watcher.end()
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		/** Runs both writes while `other` holds the row, then lets them go. */
		async function raced(
			table: string,
			writes: readonly (() => Promise<unknown>)[],
		): Promise<unknown[]> {
			await other.query('begin')
			await other.query(`update "${table}" set "stock" = "stock"`)
			const pending = writes.map(async (write) =>
				write().catch((error: unknown) => error),
			)
			await waitingOnLock(watcher, table, writes.length)
			await other.query('commit')
			return Promise.all(pending)
		}

		it('counts both through Master, which loads no row', async () => {
			const item = await Item.create({ data: { stock: 10 } }, M)
			const decrement = async () =>
				Item.update(
					{ where: { id: item.id }, data: { stock: { decrement: 1 } } },
					M,
				)
			const outcomes = await raced('item', [decrement, decrement])
			const stocks = outcomes.map((outcome): unknown =>
				Reflect.get(Object(outcome), 'stock'),
			)
			expect(stocks.map(Number).toSorted((a, b) => a - b)).toEqual([8, 9])
			const { rows } = await other.query(`select "stock" from "item"`)
			expect(rows).toEqual([{ stock: 8 }])
		})

		it('counts both through the locked row a hook reads', async () => {
			const product = await Product.create({ data: { stock: 10 } }, M)
			const decrement = async () =>
				Product.update(
					{ where: { id: product.id }, data: { stock: { decrement: 1 } } },
					M,
				)
			await raced('product', [decrement, decrement])
			const { rows } = await other.query(`select "stock" from "product"`)
			expect(rows).toEqual([{ stock: 8 }])
		})

		it('counts both through an upsert, which locks the row it finds (D-142)', async () => {
			const item = await Item.create({ data: { stock: 10 } }, M)
			const decrement = async () =>
				Item.upsert(
					{
						where: { id: item.id },
						create: { stock: 0 },
						update: { stock: { decrement: 1 } },
					},
					M,
				)
			await raced('item', [decrement, decrement])
			const { rows } = await other.query(`select "stock" from "item"`)
			expect(rows).toEqual([{ stock: 8 }])
		})

		it('lets the hook refuse the decrement that would go below 0', async () => {
			const product = await Product.create({ data: { stock: 1 } }, M)
			const decrement = async () =>
				Product.update(
					{ where: { id: product.id }, data: { stock: { decrement: 1 } } },
					M,
				)
			const outcomes = await raced('product', [decrement, decrement])
			expect(
				outcomes
					.map((outcome) =>
						outcome instanceof PublicError ? outcome.code : 'updated',
					)
					.toSorted(),
			).toEqual(['OUT_OF_STOCK', 'updated'])
			const { rows } = await other.query(`select "stock" from "product"`)
			expect(rows).toEqual([{ stock: 0 }])
		})
	})
}
