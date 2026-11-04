// Support tickets, the activity they record, and comments under a limit.
//#region ticket
import { graphql } from '@ultimabase/graphql'
import { PublicError, allow, defineModel, master } from 'ultimabase'
import { outbox } from './outbox.ts'

export const Ticket = defineModel({
	name: 'Ticket',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		status: f.enumOf(['open', 'closed'], { default: 'open' }),
		closedAt: f.dateTime({ optional: true }),
		spam: f.boolean({ default: false }),
		activity: f.many(() => Activity, { inverse: 'ticket' }),
	}),
}).with({
	access: allow.public,
	hooks: {
		// A spam ticket exists for nobody, Master included.
		beforeFind: ({ where }) => where({ spam: false }),
		// Changes `data` in place, before it is written.
		beforeCreate: ({ data }) => {
			data.title = data.title.trim()
		},
		beforeUpdate: ({ record, data }) => {
			if (data.status === 'closed' && record.status !== 'closed') {
				data.closedAt = new Date()
			}
		},
		// Throwing refuses the write; a PublicError reaches the client.
		beforeDelete: ({ record }) => {
			if (record.status === 'open') {
				throw new PublicError('TICKET_OPEN', 'Close the ticket first.')
			}
		},
		// In the write's transaction: if it throws, the update is undone.
		afterUpdate: async ({ record, previous }) => {
			if (previous.status === record.status) return
			await Activity.create(
				{
					data: {
						ticket: { connect: { id: record.id } },
						text: `${previous.status} → ${record.status}`,
					},
				},
				{ as: master },
			)
		},
		// Once the transaction commits, never after a rollback.
		afterUpdateCommit: ({ record, previous }) => {
			if (previous.status !== 'closed' && record.status === 'closed') {
				outbox.push(`Your ticket "${record.title}" is closed.`)
			}
		},
	},
})
//#endregion

export const Activity = defineModel({
	name: 'Activity',
	use: [graphql()],
	fields: (f) => ({
		ticket: f.one(() => Ticket, { onDelete: 'cascade' }),
		text: f.string(),
	}),
}).with({ access: allow.readOnly })

//#region limit
/** Each person posts at most 5 comments a minute. */
export const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		text: f.string(),
		authorId: f.string({
			default: ({ caller }) =>
				caller.kind === 'user' ? caller.user.id : undefined,
		}),
	}),
}).with({
	access: { create: ({ caller }) => caller.kind === 'user' },
	hooks: {
		// Counts operations, not requests: REST, GraphQL and server code alike.
		beforeCreate: async ({ caller }): Promise<void> => {
			if (caller.kind !== 'user') return
			const since = new Date(Date.now() - 60_000)
			const recent = await Comment.count(
				{ where: { authorId: caller.user.id, createdAt: { gt: since } } },
				{ as: master },
			)
			if (recent >= 5) {
				throw new PublicError('TOO_MANY_ATTEMPTS', 'Wait a minute.', {
					details: { retryAfter: 60 },
				})
			}
		},
	},
})
//#endregion

//#region row-rule
type Ending = { endedAt: Date | null; endReason: string | null }

// Read on the row as written, whichever fields the write changed.
function checkEnding({ endedAt, endReason }: Ending): void {
	if ((endedAt === null) !== (endReason === null)) {
		throw new PublicError('CALL_ENDING', 'An ended call has a reason.')
	}
}

/** A call ends with a reason: both fields are set, or neither. */
export const Call = defineModel({
	name: 'Call',
	fields: (f) => ({
		endedAt: f.dateTime({ optional: true }),
		endReason: f.enumOf(['done', 'missed'], { optional: true }),
	}),
}).with({
	hooks: {
		// For every caller and each row of a createMany or an updateMany, in
		// the write's transaction: throwing undoes the write.
		afterCreate: ({ record }) => {
			checkEnding(record)
		},
		afterUpdate: ({ record }) => {
			checkEnding(record)
		},
	},
})
//#endregion
