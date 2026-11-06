// What each page of 25 costs as a live list grows, from `fetchMore` to the
// commit: the lists of `wire.ts`, read by a real client over GraphQL over
// WebSocket, on a thread of its own in production mode.
// `node bench/realtime/pages.ts`.
import { parseArgs } from 'node:util'
import { Worker } from 'node:worker_threads'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { realtime } from '@ultimabase/realtime'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import type { Command, Reply, Variant } from './pages-client.ts'
import { benched, median, plugins, urlOf } from './shared.ts'

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
		target: { type: 'string', default: '50000' },
		url: { type: 'string' },
	},
})
const target = Number(values.target)
const total = target + 5000
const milestones = [500, 1000, 2000, 5000, 10_000, 20_000, 50_000].filter(
	(milestone) => milestone <= target,
)
const variants: readonly Variant[] = ['link', 'virtual', 'memo', 'every row']
const batch = 2000

const read = async (url: string, variant: Variant) =>
	new Promise<Extract<Reply, { kind: 'done' }>>((resolve, reject) => {
		const worker = new Worker(new URL('pages-client.ts', import.meta.url), {
			env: { ...process.env, NODE_ENV: 'production' },
			resourceLimits: { maxOldGenerationSizeMb: 20_000 },
		})
		worker.on('message', (reply: Reply) => {
			void worker.terminate()
			if (reply.kind === 'failed') reject(new Error(reply.message))
			else resolve(reply)
		})
		worker.on('error', reject)
		const command: Command = { url, variant, target, milestones }
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker's, not a window's.
		worker.postMessage(command)
	})

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
			`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${total} rows; times in ms.`,
		)
		const url = `${origin.replace(/^http/, 'ws')}/graphql`
		for (const variant of variants) {
			const started = performance.now()
			const { pages, merges } = await read(url, variant)
			const seconds = (performance.now() - started) / 1000
			console.log(`\n${variant}, ${seconds.toFixed(0)} s in all:\n`)
			console.log(
				'| Rows reached | Rows on screen | All settled | Worst |\n| --: | --: | --: | --: |',
			)
			for (const milestone of milestones) {
				const near = pages.filter(
					({ size }) => size > milestone - 500 && size <= milestone,
				)
				const settled = near.map((page) => page.settled)
				console.log(
					`| ${milestone} | ${median(near.map(({ rows }) => rows)).toFixed(1)} | ${median(settled).toFixed(1)} | ${Math.max(...settled).toFixed(1)} |`,
				)
			}
			if (merges.length > 0) {
				console.log(
					'\n| Rows | `applyLive`, a page | `applyLive`, 1 row in 50 |\n| --: | --: | --: |',
				)
				for (const { size, page, author } of merges) {
					console.log(`| ${size} | ${page.toFixed(2)} | ${author.toFixed(2)} |`)
				}
			}
			await bench.quiet()
		}
	},
)
