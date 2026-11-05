// What the platform bench writes: its rows before it starts, and each write
// at a sustained rate.
import { master } from 'ultimabase'
import {
	Campaign,
	CampaignMember,
	CampaignNpc,
	Chat,
	ChatMember,
	ChatMessage,
	User,
} from './platform-models.ts'

const M = { as: master }

const chunks = <T>(all: readonly T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(all.length / size) }, (_, i) =>
		all.slice(i * size, (i + 1) * size),
	)
const connect = (id: string) => ({ connect: { id } })

export type World = {
	readonly users: readonly string[]
	readonly chats: readonly string[]
	readonly campaigns: readonly string[]
}

/** Creates the rows of `scenario`, for `userCount` users. */
export async function seed(
	scenario: string,
	userCount: number,
): Promise<World> {
	const users: string[] = []
	for (const data of chunks(
		Array.from({ length: userCount }, (_, i) => ({ name: `u${i}` })),
		1000,
	)) {
		const made = await User.createManyAndReturn({ data }, M)
		users.push(...made.map(({ id }) => id))
	}
	const userAt = (index: number) => users[index % userCount] ?? ''

	// Private chats of two; a user is at `index`, their chat at `index / 2`.
	const chats: string[] = []
	const seeded = scenario === 'chat' ? 30 : 1
	if (scenario !== 'campaign') {
		const pairs = Math.floor(userCount / 2)
		for (const data of chunks(
			Array.from({ length: pairs }, () => ({ lastMessageAt: new Date() })),
			1000,
		)) {
			const made = await Chat.createManyAndReturn({ data }, M)
			chats.push(...made.map(({ id }) => id))
		}
		for (const part of chunks(users, 1000)) {
			const from = users.indexOf(part[0] ?? '')
			await ChatMember.createMany(
				{
					data: part.map((id, i) => ({
						chat: connect(chats[Math.floor((from + i) / 2)] ?? ''),
						user: connect(id),
						lastReadAt: new Date(),
					})),
				},
				M,
			)
		}
		const texts = chats.flatMap((chat, c) =>
			Array.from({ length: seeded }, (_, i) => ({
				text: `seed ${i}`,
				chat: connect(chat),
				user: connect(userAt(c * 2 + (i % 2))),
			})),
		)
		for (const data of chunks(texts, 1000)) {
			await ChatMessage.createMany({ data }, M)
		}
	}

	// Campaigns of five: a game master, the only writer, and four players.
	const campaigns: string[] = []
	if (scenario === 'campaign') {
		const size = 5
		const count = Math.floor(userCount / size)
		for (const data of chunks(
			Array.from({ length: count }, (_, c) => ({
				name: `c${c}`,
				gameMaster: connect(userAt(c * size)),
			})),
			1000,
		)) {
			const made = await Campaign.createManyAndReturn({ data }, M)
			campaigns.push(...made.map(({ id }) => id))
		}
		const members = campaigns.flatMap((campaign, c) =>
			[1, 2, 3, 4].map((k) => ({
				campaign: connect(campaign),
				user: connect(userAt(c * size + k)),
				status: 'member',
			})),
		)
		for (const data of chunks(members, 1000)) {
			await CampaignMember.createMany({ data }, M)
		}
		const npcs = campaigns.flatMap((campaign) =>
			Array.from({ length: 20 }, (_, i) => ({
				name: `seed ${i}`,
				campaign: connect(campaign),
			})),
		)
		for (const data of chunks(npcs, 1000)) {
			await CampaignNpc.createMany({ data }, M)
		}
	}
	return { users, chats, campaigns }
}

/** One write of `scenario`, due at `due`. */
export function writerOf(
	scenario: string,
	{ users, chats, campaigns }: World,
): (due: number, index: number) => Promise<void> {
	const userAt = (index: number) => users[index % users.length] ?? ''
	const flipped = new Map<string, boolean>()
	return async (due: number, index: number): Promise<void> => {
		if (scenario === 'chat') {
			const c = index % chats.length
			const chat = chats[c] ?? ''
			const author = userAt(c * 2 + (index % 2))
			const other = userAt(c * 2 + 1 - (index % 2))
			// A message, its unread count, the chat's time, then read at once.
			await ChatMessage.create(
				{
					data: {
						text: String(due),
						chat: connect(chat),
						user: connect(author),
					},
				},
				M,
			)
			await ChatMember.updateMany(
				{
					where: { chat: { is: { id: chat } }, user: { is: { id: other } } },
					data: { unreadCount: { increment: 1 } },
				},
				M,
			)
			await Chat.update(
				{ where: { id: chat }, data: { lastMessageAt: new Date() } },
				M,
			)
			await ChatMember.updateMany(
				{
					where: { chat: { is: { id: chat } }, user: { is: { id: other } } },
					data: { unreadCount: 0, lastReadAt: new Date() },
				},
				M,
			)
			return
		}
		if (scenario === 'campaign') {
			await CampaignNpc.create(
				{
					data: {
						name: String(due),
						campaign: connect(campaigns[index % campaigns.length] ?? ''),
					},
				},
				M,
			)
			return
		}
		const id = userAt(index)
		const online = !(flipped.get(id) ?? false)
		flipped.set(id, online)
		await User.update(
			{
				where: { id },
				data: { isOnline: online, lastSeenAt: new Date(due) },
			},
			M,
		)
	}
}
