// What a live list costs from the write to the socket's far end (D-252): the
// lists of `lists.ts`, read by real clients over GraphQL over WebSocket from a
// thread of their own, so JSON, compression and the sockets count. Clients do
// not parse; React is not here.
// `node --expose-gc --max-old-space-size=24576 bench/realtime/wire.ts`.
import { randomUUID } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { Worker } from 'node:worker_threads'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { realtime } from '@ultimabase/realtime'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { benched, median, plugins, urlOf, waited } from './shared.ts'
import type { Command, Reply } from './wire-clients.ts'

const M = { as: master }
const open = { access: { read: () => true } }
const use = [graphql(), realtime()]
const Person = defineModel({
	name: 'Person',
	use,
	fields: (f) => ({ name: f.string() }),
}).with(open)
const Msg = defineModel({
	name: 'Msg',
	use,
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
	use,
	fields: (f) => ({ url: f.string(), msg: f.one(() => Msg) }),
	indexes: [{ fields: ['msg'] }],
}).with(open)

const query = `subscription ($first: Int) {
	msgs(first: $first, orderBy: [{ rank: asc }]) {
		edges { cursor node {
			__typename id text rank
			author { __typename id name }
			parts(first: 8) { edges { node { __typename id url } } }
		} }
		pageInfo { hasNextPage endCursor }
	}
}`
const batch = 2000
const now = () => performance.timeOrigin + performance.now()
const heap = async (): Promise<number> => {
	for (let run = 0; run < 3; run += 1) {
		globalThis.gc?.()
		await waited(50)
	}
	return process.memoryUsage().heapUsed
}

let origin = ''
const logger: Logger = {
	info: (first: string | object) => {
		if (typeof first === 'string' && first.startsWith('Listening on')) {
			origin = first.replace(/^Listening on (.*)\.$/, '$1')
		}
	},
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		console.error(message ?? first, typeof first === 'object' ? first : '')
	},
	child: () => logger,
}

const { values } = parseArgs({
	options: {
		cases: { type: 'string', default: '25x1000,2000x100,10000x20,50000x20' },
		total: { type: 'string', default: '55000' },
		url: { type: 'string' },
		plain: { type: 'boolean', default: false },
		// The bystander writes an author the list shows: messages reach full sockets.
		busy: { type: 'boolean', default: false },
	},
})
const total = Number(values.total)
const deflate = !values.plain
const cases = values.cases
	.split(',')
	.map((text) => text.split('x').map(Number))
	.map(([rows = 0, subscribers = 0]) => ({ rows, subscribers }))

const worker = new Worker(new URL('wire-clients.ts', import.meta.url))
const waiting = new Map<Reply['kind'], (reply: Reply) => void>()
let failure: ((error: Error) => void) | undefined
worker.on('message', (reply: Reply) => {
	if (reply.kind === 'failed') failure?.(new Error(reply.message))
	else waiting.get(reply.kind)?.(reply)
})
/** The clients' next reply of `kind`, or their failure, within `seconds`. */
const next = async <Kind extends Reply['kind']>(kind: Kind, seconds = 60) =>
	new Promise<Extract<Reply, { kind: Kind }>>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`No ${kind} in ${seconds} s.`))
		}, seconds * 1000)
		failure = reject
		waiting.set(kind, (reply) => {
			clearTimeout(timer)
			if (reply.kind === kind) {
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Its kind was just compared.
				resolve(reply as Extract<Reply, { kind: Kind }>)
			}
		})
	})
const told = (command: Command) => {
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker's, not a window's.
	worker.postMessage(command)
}

try {
	await benched(
		urlOf(values.url),
		(database) =>
			defineApp({
				database,
				models: [Person, Msg, Part],
				plugins: [httpPlugin({ port: 0 }), ...plugins, graphqlPlugin()],
				logger,
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
			const url = `${origin.replace(/^http/, 'ws')}/graphql`
			console.log(
				`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${total} rows, compression ${deflate ? 'on' : 'off'}; median of 3, times in ms.\n`,
			)
			console.log(
				'| Rows | Subscribers | One alone | All at once | Longest stall | Others wait | Caught up | KiB a subscriber | First message MiB | Update | Author of 1 row in 50 | New first row |\n| --: | --: | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |',
			)
			const opening = async (
				from: number,
				count: number,
				rows: number,
			): Promise<{
				readonly at: number
				readonly ms: number
				readonly bytes: number
			}> => {
				const start = now()
				const reached = next('opened', 600)
				told({
					kind: 'open',
					url,
					from,
					count,
					query,
					variables: { first: rows },
					deflate,
				})
				const { at, bytes } = await reached
				return { at, ms: at - start, bytes }
			}
			const closing = async () => {
				const closed = next('closed')
				told({ kind: 'close' })
				await closed
				await waited(200)
				await bench.quiet()
			}
			// Shown by the bystander's list alone: no message follows it.
			const other = await Person.create({ data: { name: 'a' } }, M)
			const bystander = await bench.api.connect(
				new Request('http://localhost/', {
					headers: { authorization: 'bystander' },
				}),
			)
			let reachedBystander: (() => void) | undefined
			await bystander.list(
				'Person',
				{ orderBy: [{ name: 'asc' }], first: 5, select: { name: true } },
				(message) => {
					if (message.kind !== 'reset') reachedBystander?.()
				},
			)
			/**
			 * Writes to a small list someone else follows while a case's subscribers
			 * open: the median and the slowest of what its messages took.
			 */
			const bystanding = (rows: number) => {
				const state = { stopped: rows < 2000 }
				const waits: number[] = []
				const run = (async () => {
					while (!state.stopped) {
						const start = now()
						const reached = new Promise<void>((resolve) => {
							reachedBystander = resolve
						})
						await Person.update(
							{
								where: { id: values.busy ? (people[0]?.id ?? '') : other.id },
								data: { name: 'a' + randomUUID() },
							},
							M,
						)
						await reached
						waits.push(now() - start)
						await waited(200)
					}
				})()
				return async () => {
					state.stopped = true
					await run
					if (waits.length === 0) return '-'
					return `${median(waits).toFixed(0)} / ${Math.max(...waits).toFixed(0)}`
				}
			}
			for (const { rows, subscribers } of cases) {
				const alone = await opening(0, 1, rows)
				await closing()
				const before = await heap()
				const stalls = monitorEventLoopDelay({ resolution: 5 })
				stalls.enable()
				const others = bystanding(rows)
				const all = await opening(0, subscribers, rows)
				const waits = await others()
				stalls.disable()
				await bench.quiet()
				// What was told during the opening still has to arrive; a whole read
				// sent again is silent while it reads.
				const settled = next('settled', 900)
				told({ kind: 'settle', silence: 15_000 })
				const caughtUp = Math.max(0, (await settled).at - all.at)
				await bench.quiet()
				const held = ((await heap()) - before) / subscribers / 1024
				const write = async (run: (index: number) => Promise<unknown>) => {
					const statements: number[] = []
					const times: number[] = []
					let bytes = 0
					for (let index = 0; index < 3; index += 1) {
						const ready = next('ready')
						told({ kind: 'expect', count: subscribers })
						await ready
						const reached = next('reached')
						const statementsBefore = bench.statements()
						await run(index)
						const written = now()
						const last = await reached
						times.push(last.at - written)
						bytes = last.bytes
						await bench.quiet()
						statements.push(bench.statements() - statementsBefore)
					}
					const ready = next('ready')
					told({ kind: 'expect', count: Number.POSITIVE_INFINITY })
					await ready
					return `${median(statements)} stmts, ${median(times).toFixed(1)}, ${(bytes / 1024).toFixed(1)} KiB`
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
				console.log(
					`| ${rows} | ${subscribers} | ${alone.ms.toFixed(0)} | ${all.ms.toFixed(0)} | ${(stalls.max / 1e6).toFixed(0)} | ${waits} | ${caughtUp.toFixed(0)} | ${held.toFixed(0)} | ${(all.bytes / 1048576).toFixed(2)} | ${update} | ${author} | ${insert} |`,
				)
				for (const id of made) await Msg.delete({ where: { id } }, M)
				await bench.quiet()
				await closing()
			}
		},
	)
} finally {
	await worker.terminate()
}
