// Support tickets, and the activity they record.
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
		activity: f.many(() => Activity),
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
