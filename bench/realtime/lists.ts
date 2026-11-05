// What a write costs a live list whose rows show related rows (D-252), at any
// list size: each row has an author and 8 attachments, read by every
// subscriber. Prints statements and the last message's time for a write the
// list shows, an author of 1 row in 50, and a new first row.
// `node --expose-gc --max-old-space-size=24576 bench/realtime/lists.ts`.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import type { LiveMessage } from '@ultimabase/realtime'
import { realtime } from '@ultimabase/realtime'
import { defineApp, defineModel, master } from 'ultimabase'
import { silent } from '../../packages/testing/src/silent.ts'
import { benched, plugins, timed, urlOf, waited } from './shared.ts'

const M = { as: master }
const open = { access: { read: () => true } }
const Person = defineModel({
	name: 'Person',
	use: [realtime()],
	fields: (f) => ({ name: f.string() }),
}).with(open)
const Msg = defineModel({
	name: 'Msg',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		rank: f.number({ integer: true }),
		author: f.one(() => Person),
		parts: f.many(() => Part, { inverse: 'msg' }),
	}),
	indexes: [{ fields: ['rank'] }],
}).with(open)
const Part = defineModel({
	name: 'Part',
	use: [realtime()],
	fields: (f) => ({ url: f.string(), msg: f.one(() => Msg) }),
	indexes: [{ fields: ['msg'] }],
}).with(open)

const heap = async (): Promise<number> => {
	for (let run = 0; run < 3; run += 1) {
		globalThis.gc?.()
		await waited(50)
	}
	return process.memoryUsage().heapUsed
}
const select = {
	text: true,
	rank: true,
	author: { select: { name: true } },
	parts: { take: 8, select: { url: true } },
}
const batch = 2000

const { values } = parseArgs({
	options: {
		cases: {
			type: 'string',
			default: '25x100,25x1000,2000x10,10000x5,50000x5',
		},
		total: { type: 'string', default: '55000' },
		url: { type: 'string' },
	},
})
const total = Number(values.total)
const cases = values.cases
	.split(',')
	.map((text) => text.split('x').map(Number))
	.map(([rows = 0, subscribers = 0]) => ({ rows, subscribers }))

await benched(
	urlOf(values.url),
	(database) =>
		defineApp({
			database,
			models: [Person, Msg, Part],
			plugins,
			logger: silent,
		}),
	async (bench) => {
		const people = await Person.createManyAndReturn(
			{ data: Array.from({ length: 50 }, (_, i) => ({ name: `p${i}` })) },
			M,
		)
		const ids: string[] = []
		for (let from = 0; from < total; from += batch) {
			const made = await Msg.createManyAndReturn(
				{
					data: Array.from({ length: batch }, (_, i) => ({
						text: `text of message ${from + i}`,
						rank: from + i + 1,
						author: { connect: { id: people[(from + i) % 50]?.id ?? '' } },
					})),
				},
				M,
			)
			ids.push(...made.map(({ id }) => id))
			await Part.createMany(
				{
					data: made.flatMap(({ id }) =>
						Array.from({ length: 8 }, (_, k) => ({
							url: `https://cdn.example.com/${id}/${k}.png`,
							msg: { connect: { id } },
						})),
					),
				},
				M,
			)
		}
		await bench.analyzed()
		console.log(
			`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${total} rows; median of 3, times in ms.\n`,
		)
		console.log(
			'| Rows | Subscribers | Subscribe each | KiB a subscriber | Bytes a row | First message MiB | Grow | Update | Author of 1 row in 50 | New first row |\n| --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |',
		)
		// In a function of its own: nothing keeps a case's lists once it ended.
		const measure = async (rows: number, subscribers: number) => {
			let counting = false
			let arrived = 0
			let firstBytes = 0
			const send = (message: LiveMessage) => {
				if (message.kind === 'reset')
					firstBytes = JSON.stringify(message).length
				else if (counting) arrived += 1
			}
			const viewers = await Promise.all(
				Array.from({ length: subscribers }, async (_, i) =>
					bench.api.connect(
						new Request('http://localhost/', {
							headers: { authorization: `u${i}` },
						}),
					),
				),
			)
			const before = await heap()
			const start = performance.now()
			const handles = []
			for (const viewer of viewers) {
				handles.push(
					await viewer.list(
						'Msg',
						{ orderBy: [{ rank: 'asc' }], first: rows, select },
						send,
					),
				)
			}
			const each = (performance.now() - start) / subscribers
			const held = (await heap()) - before
			await bench.quiet()
			const write = async (run: (index: number) => Promise<unknown>) => {
				const { statements, lastMs } = await timed(
					bench,
					run,
					() => arrived >= subscribers,
					(started) => {
						arrived = 0
						counting = started
					},
				)
				return `${statements} stmts, ${lastMs.toFixed(1)}`
			}
			const update = await write(async () =>
				Msg.update(
					{
						where: { id: ids[Math.floor(rows / 2)] ?? '' },
						data: { text: randomUUID() },
					},
					M,
				),
			)
			const author = await write(async () =>
				Person.update(
					{
						where: { id: people[0]?.id ?? '' },
						data: { name: randomUUID() },
					},
					M,
				),
			)
			const made: string[] = []
			const insert = await write(async (index) => {
				const { id } = await Msg.create(
					{
						data: {
							text: 'n',
							rank: -index - 1000,
							author: { connect: { id: people[1]?.id ?? '' } },
						},
					},
					M,
				)
				made.push(id)
			})
			const grown = performance.now()
			await handles[0]?.grow(25)
			const growMs = performance.now() - grown
			console.log(
				`| ${rows} | ${subscribers} | ${each.toFixed(1)} | ${Math.round(held / subscribers / 1024)} | ${Math.round(held / subscribers / rows)} | ${(firstBytes / 1048576).toFixed(2)} | ${growMs.toFixed(1)} | ${update} | ${author} | ${insert} |`,
			)
			for (const id of made) await Msg.delete({ where: { id } }, M)
			await bench.quiet()
			for (const handle of handles) handle.close()
			for (const viewer of viewers) viewer.close()
			await waited(100)
		}
		for (const { rows, subscribers } of cases) await measure(rows, subscribers)
	},
)
