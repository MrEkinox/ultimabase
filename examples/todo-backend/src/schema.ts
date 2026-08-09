import { Schema } from '@ultimabase/core'

/** Stores one immutable task managed by the backend. */
export const Todo = Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({
			description: 'Short task summary shown in todo lists.',
			validation: { length: { max: 200 }, required: true },
		}),
		description: field.string({
			description: 'Optional details needed to complete the task.',
		}),
		completed: field.boolean({
			default: false,
			description: 'Whether the task has been completed.',
			validation: { required: true },
		}),
		priority: field.enum({
			default: 'medium',
			description: 'Controls the order in which a task should be handled.',
			typeName: 'TodoPriority',
			validation: { required: true },
			values: ['low', 'medium', 'high'],
		}),
		dueAt: field.dateTime({
			description: 'Optional ISO timestamp for the task deadline.',
		}),
		details: field.object({
			description: 'Structured information attached to the task.',
			fields: (field) => ({
				notes: field.string(),
				labels: field.string({ list: true }),
			}),
			typeName: 'TodoDetails',
		}),
	}),
})
