// What a write costs live lists that show a virtual reading another model:
// subscribers list Project with openTasks, a count of Task; a Task is
// created on a shown project. `node --expose-gc bench/realtime/virtuals.ts`.
// `--rule-names-nobody`: Project's read rule does not name its viewer, so the
// count does not either, and the subscribers share its statement (D-295).
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import { z } from 'zod'
import type { LiveMessage, Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { Caller, PluginTypes } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'
import { silent } from '../../packages/testing/src/silent.ts'

const { values: flags } = parseArgs({
	options: {
		subscribers: { type: 'string', default: '1000' },
		windows: { type: 'string', default: '25,1000' },
		writes: { type: 'string', default: '10' },
		'rule-names-nobody': { type: 'boolean', default: false },
		url: { type: 'string' },
	},
})

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

const Project = defineModel({
	name: 'Project',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		owner: f.string(),
		tasks: f.many(() => Task, { inverse: 'project' }),
		openTasks: f.virtual(z.int(), { needs: [] }),
	}),
	indexes: [{ fields: ['owner', 'name'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where(
				flags['rule-names-nobody']
					? { owner: { not: 'nobody' } }
					: { owner: { in: [idOf(caller), 'all'] } },
			),
	},
	virtuals: {
		openTasks: {
			runMany: async ({ caller, records }) => {
				const ids = records.map(({ id }) => id)
				const groups = await Task.groupBy(
					{
						by: ['project'],
						_count: true,
						where: { project: { is: { id: { in: ids } } }, done: false },
					},
					{ as: caller },
				)
				const counts = new Map(
					groups.map((group) => [group.project?.id, group._count]),
				)
				return ids.map((id) => counts.get(id) ?? 0)
			},
		},
	},
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		done: f.boolean({ default: false }),
		project: f.one(() => Project),
	}),
}).with({ access: { read: () => true } })

let api: RealtimeApi | undefined
interface Bench extends PluginTypes {
	readonly name: 'bench'
	readonly requires: Realtime
}
const benchPlugin = definePlugin<Bench>({
	name: 'bench',
	manifest: {
		name: 'bench',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

const at = (values: readonly number[], share: number): number => {
	const sorted = values.toSorted((a, b) => a - b)
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
	)
}
const ms = (value: number): string => value.toFixed(1)
const waited = async (delay: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, delay)
	})

async function query(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

async function bounded(
	count: number,
	limit: number,
	task: (index: number) => Promise<void>,
): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (next < count) {
			const index = next
			next += 1
			await task(index)
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
}

type Shape = 'one list' | 'a list each'

async function run(
	url: string,
	shape: Shape,
	subscribers: number,
	window: number,
	virtual: boolean,
	writes: number,
): Promise<string> {
	const schema = `bench_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	let statements = 0
	const separator = url.includes('?') ? '&' : '?'
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const database = createAdapter({
		url: `${url}${separator}options=${options}`,
		log: () => {
			statements += 1
		},
	})
	const plugins = [realtimePlugin(), benchPlugin.plugin()]
	const app = defineApp({
		database,
		models: [Project, Task],
		plugins,
		logger: silent,
	})
	await app.start()
	try {
		const one = shape === 'one list'
		const users = Array.from({ length: subscribers }, (_, i) => `u${i}`)
		const owners = one ? ['all'] : users
		const shown = new Map<string, string>()
		await bounded(owners.length, 8, async (i) => {
			const owner = owners[i] ?? ''
			const data = Array.from({ length: window }, (_, n) => ({
				name: `p${String(n).padStart(5, '0')}`,
				owner,
			}))
			const rows = await Project.createManyAndReturn({ data }, M)
			shown.set(owner, rows[Math.floor(window / 2)]?.id ?? '')
		})
		await waited(200)
		const realtimeApi = api
		if (realtimeApi === undefined) throw new Error('No realtime API.')
		let t0 = 0
		let arrived = 0
		const latencies: number[] = []
		const send = (message: LiveMessage) => {
			if (t0 === 0 || message.kind !== 'changes') return
			arrived += 1
			latencies.push(performance.now() - t0)
		}
		const viewers = await Promise.all(
			users.map(async (id) =>
				realtimeApi.connect(
					new Request('http://localhost/', { headers: { authorization: id } }),
				),
			),
		)
		await bounded(viewers.length, 16, async (i) => {
			const args = {
				where: { owner: one ? 'all' : users[i] },
				orderBy: [{ name: 'asc' }],
				first: window,
				select: virtual ? { name: true, openTasks: true } : { name: true },
			}
			await viewers[i]?.list('Project', args, send)
		})
		const counts: number[] = []
		const all: number[] = []
		const lasts: number[] = []
		const messages: number[] = []
		for (let index = -2; index < writes; index += 1) {
			const owner = owners[Math.abs(index) % owners.length] ?? ''
			arrived = 0
			latencies.length = 0
			await Task.create(
				{ data: { project: { connect: { id: shown.get(owner) ?? '' } } } },
				M,
			)
			t0 = performance.now()
			const after = statements
			const expected = virtual ? (one ? subscribers : 1) : 0
			const deadline = t0 + 60_000
			const heard = () => arrived >= expected
			while (!heard() && performance.now() < deadline) await waited(1)
			const last = performance.now() - t0
			let quiet = statements
			do {
				quiet = statements
				await waited(150)
			} while (statements !== quiet)
			t0 = 0
			if (index < 0) continue
			counts.push(statements - after)
			lasts.push(last)
			messages.push(arrived)
			all.push(...latencies)
		}
		return `| ${subscribers} | ${shape} | ${window} | ${virtual ? 'yes' : 'no'} | ${Math.min(...counts)}–${Math.max(...counts)} | ${Math.max(...messages)} | ${ms(at(all, 0.5))} | ${ms(at(all, 0.99))} | ${ms(at(lasts, 0.5))} |`
	} finally {
		await app.stop()
		await query(url, `drop schema "${schema}" cascade`)
	}
}

const url =
	flags.url ??
	process.env['BENCH_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54318/postgres'
const numbers = (text: string) => text.split(',').map(Number)
console.log(
	'| Subscribers | Lists | Window | Virtual selected | Statements | Messages | p50 | p99 | Last message p50 |\n| --: | --- | --: | --- | --: | --: | --: | --: | --: |',
)
for (const subscribers of numbers(flags.subscribers)) {
	for (const shape of ['one list', 'a list each'] as const) {
		for (const window of numbers(flags.windows)) {
			for (const virtual of [false, true]) {
				console.log(
					await run(
						url,
						shape,
						subscribers,
						window,
						virtual,
						Number(flags.writes),
					),
				)
			}
		}
	}
}
