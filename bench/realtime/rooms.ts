// What a write costs live lists whose read rule names the viewer through a
// relation (D-252), as a chat's rooms: only a room's members may read its
// messages and their attachments. A room's writes should cost its members, not
// who else is connected. `node --expose-gc bench/realtime/rooms.ts`.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { realtime } from '@ultimabase/realtime'
import type { Caller } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { silent } from '../../packages/testing/src/silent.ts'
import { benched, plugins, timed, urlOf, waited } from './shared.ts'

const M = { as: master }
const open = { access: { read: () => true } }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
const member = (caller: Caller) => ({
	members: { some: { user: { is: { id: idOf(caller) } } } },
})
const { values } = parseArgs({
	options: {
		rooms: { type: 'string', default: '200' },
		viewers: { type: 'string', default: '5' },
		window: { type: 'string', default: '25' },
		'open-parts': { type: 'boolean', default: false },
		url: { type: 'string' },
	},
})
const User = defineModel({
	name: 'User',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Member, { inverse: 'user' }),
	}),
}).with(open)
const Room = defineModel({
	name: 'Room',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'room' }),
		msgs: f.many(() => Msg, { inverse: 'room' }),
	}),
}).with(open)
const Member = defineModel({
	name: 'Member',
	use: [realtime()],
	fields: (f) => ({ user: f.one(() => User), room: f.one(() => Room) }),
	indexes: [{ fields: ['user', 'room'] }, { fields: ['room'] }],
}).with(open)
const Msg = defineModel({
	name: 'Msg',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		rank: f.number({ integer: true }),
		room: f.one(() => Room),
		author: f.one(() => User),
		parts: f.many(() => Part, { inverse: 'msg' }),
	}),
	indexes: [{ fields: ['room', 'rank'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ room: { is: member(caller) } }),
	},
})
const Part = defineModel({
	name: 'Part',
	use: [realtime()],
	fields: (f) => ({ url: f.string(), msg: f.one(() => Msg) }),
	indexes: [{ fields: ['msg'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			values['open-parts'] ||
			caller.kind === 'master' ||
			where({ msg: { is: { room: { is: member(caller) } } } }),
	},
})

const rooms = Number(values.rooms)
const per = Number(values.viewers)
const rows = Number(values.window)
const select = {
	text: true,
	rank: true,
	author: { select: { name: true } },
	parts: { take: 8, select: { url: true } },
}

await benched(
	urlOf(values.url),
	(database) =>
		defineApp({
			database,
			models: [User, Room, Member, Msg, Part],
			plugins,
			logger: silent,
		}),
	async (bench) => {
		const made = await Room.createManyAndReturn(
			{ data: Array.from({ length: rooms }, (_, i) => ({ name: `r${i}` })) },
			M,
		)
		const users = await User.createManyAndReturn(
			{
				data: Array.from({ length: rooms * per }, (_, i) => ({
					name: `u${i}`,
				})),
			},
			M,
		)
		const roomOf = (index: number) => made[Math.floor(index / per)]?.id ?? ''
		await Member.createMany(
			{
				data: users.map(({ id }, i) => ({
					user: { connect: { id } },
					room: { connect: { id: roomOf(i) } },
				})),
			},
			M,
		)
		let shown = ''
		for (const [index, room] of made.entries()) {
			const messages = await Msg.createManyAndReturn(
				{
					data: Array.from({ length: rows + 5 }, (_, i) => ({
						text: `text ${i}`,
						rank: i + 1,
						room: { connect: { id: room.id } },
						author: { connect: { id: users[index * per]?.id ?? '' } },
					})),
				},
				M,
			)
			if (index === 0) shown = messages[Math.floor(rows / 2)]?.id ?? ''
			await Part.createMany(
				{
					data: messages.flatMap(({ id }) =>
						Array.from({ length: id === shown ? 2 : 8 }, (_, k) => ({
							url: `https://cdn.example.com/${id}/${k}.png`,
							msg: { connect: { id } },
						})),
					),
				},
				M,
			)
		}
		await bench.analyzed()
		let counting = false
		let arrived = 0
		let others = 0
		const handles = []
		const viewers = []
		const start = performance.now()
		for (const [index, { id }] of users.entries()) {
			const viewer = await bench.api.connect(
				new Request('http://localhost/', { headers: { authorization: id } }),
			)
			viewers.push(viewer)
			const inFirst = index < per
			handles.push(
				await viewer.list(
					'Msg',
					{
						where: { room: { is: { id: roomOf(index) } } },
						orderBy: [{ rank: 'asc' }],
						first: rows,
						select,
					},
					(message) => {
						if (message.kind === 'reset' || !counting) return
						if (inFirst) arrived += 1
						else others += 1
					},
				),
			)
		}
		const each = (performance.now() - start) / users.length
		await bench.quiet()
		console.log(
			`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${rooms} rooms of ${per}, ${rows} rows a list; subscribe ${each.toFixed(1)} ms each; median of 3, times in ms.\n`,
		)
		console.log(
			'| Write | Statements | Last message | Other rooms told |\n| --- | --: | --: | --: |',
		)
		const write = async (
			name: string,
			run: (index: number) => Promise<unknown>,
		) => {
			let told = 0
			const { statements, lastMs } = await timed(
				bench,
				run,
				() => arrived >= per,
				(started) => {
					if (started) {
						arrived = 0
						others = 0
					} else told = Math.max(told, others)
					counting = started
				},
			)
			console.log(
				`| ${name} | ${statements} | ${lastMs.toFixed(1)} | ${told} |`,
			)
		}
		const first = users[0]?.id ?? ''
		await write('update text', async () =>
			Msg.update({ where: { id: shown }, data: { text: randomUUID() } }, M),
		)
		await write('update author', async () =>
			User.update({ where: { id: first }, data: { name: randomUUID() } }, M),
		)
		await write('new attachment', async () =>
			Part.create({ data: { url: 'x', msg: { connect: { id: shown } } } }, M),
		)
		await write('new first row', async (index) =>
			Msg.create(
				{
					data: {
						text: 'n',
						rank: -index - 1000,
						room: { connect: { id: roomOf(0) } },
						author: { connect: { id: first } },
					},
				},
				M,
			),
		)
		for (const handle of handles) handle.close()
		for (const viewer of viewers) viewer.close()
		await waited(100)
	},
)
