// The models and the function of the platform bench: what its screens read.
import { realtime } from '@ultimabase/realtime'
import type { Caller } from 'ultimabase'
import { allow, defineFunction, defineModel } from 'ultimabase'
import { z } from 'zod'

const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
const me = (caller: Caller) => ({ is: { id: idOf(caller) } })
const chatOf = (caller: Caller) => ({
	members: { some: { user: me(caller) } },
})
export const playedBy = (caller: Caller) => ({
	OR: [
		{ gameMaster: me(caller) },
		{ members: { some: { user: me(caller), status: 'member' } } },
	],
})

export const User = defineModel({
	name: 'User',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		isOnline: f.boolean({ default: false }),
		lastSeenAt: f.dateTime({ optional: true }),
	}),
}).with({ access: { read: () => true } })
export const Chat = defineModel({
	name: 'Chat',
	use: [realtime()],
	fields: (f) => ({
		lastMessageAt: f.dateTime(),
		members: f.many(() => ChatMember, { inverse: 'chat' }),
		messages: f.many(() => ChatMessage, { inverse: 'chat' }),
	}),
	indexes: [{ fields: ['lastMessageAt'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where(chatOf(caller)),
	},
})
export const ChatMember = defineModel({
	name: 'ChatMember',
	use: [realtime()],
	fields: (f) => ({
		chat: f.one(() => Chat),
		user: f.one(() => User),
		lastReadAt: f.dateTime(),
		unreadCount: f.number({ integer: true, default: 0 }),
	}),
	indexes: [{ fields: ['chat', 'user'] }, { fields: ['user', 'unreadCount'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ chat: { is: chatOf(caller) } }),
	},
})
export const ChatMessage = defineModel({
	name: 'ChatMessage',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		chat: f.one(() => Chat),
		user: f.one(() => User),
	}),
	indexes: [{ fields: ['chat', 'createdAt'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ chat: { is: chatOf(caller) } }),
	},
})
export const FriendRequest = defineModel({
	name: 'FriendRequest',
	use: [realtime()],
	fields: (f) => ({ toUser: f.one(() => User), fromUser: f.one(() => User) }),
	indexes: [{ fields: ['toUser'] }, { fields: ['fromUser'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ OR: [{ toUser: me(caller) }, { fromUser: me(caller) }] }),
	},
})
export const Campaign = defineModel({
	name: 'Campaign',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		gameMaster: f.one(() => User),
		members: f.many(() => CampaignMember, { inverse: 'campaign' }),
		npcs: f.many(() => CampaignNpc, { inverse: 'campaign' }),
	}),
	indexes: [{ fields: ['gameMaster'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where(playedBy(caller)),
	},
})
export const CampaignMember = defineModel({
	name: 'CampaignMember',
	use: [realtime()],
	fields: (f) => ({
		campaign: f.one(() => Campaign),
		user: f.one(() => User),
		status: f.string(),
	}),
	indexes: [{ fields: ['campaign', 'user'] }, { fields: ['user'] }],
}).with({ access: { read: () => true } })
export const CampaignNpc = defineModel({
	name: 'CampaignNpc',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		visible: f.boolean({ default: true }),
		campaign: f.one(() => Campaign),
	}),
	indexes: [{ fields: ['campaign', 'updatedAt'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				OR: [
					{ campaign: { is: { gameMaster: me(caller) } } },
					{ visible: true, campaign: { is: playedBy(caller) } },
				],
			}),
	},
})

/** How many times a viewer's badges ran. */
export const badgeRuns = { count: 0 }
export const badges = defineFunction({
	name: 'badges',
	query: true,
	use: [realtime()],
	output: z.object({ unread: z.number(), friends: z.number() }),
	run: async ({ caller }) => {
		badgeRuns.count += 1
		const as = { as: caller }
		const [unread, friends] = await Promise.all([
			ChatMember.findMany(
				{
					where: { user: me(caller), unreadCount: { gt: 0 } },
					select: { unreadCount: true },
				},
				as,
			),
			FriendRequest.count({ where: { toUser: me(caller) } }, as),
		])
		return {
			unread: unread.reduce((sum, row) => sum + row.unreadCount, 0),
			friends,
		}
	},
}).with({ access: allow.public })
