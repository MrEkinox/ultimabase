import { Schema } from '@ultimabase/core'

/** Owns tasks assigned to one person and demonstrates inverse relations. */
export const TodoUser = Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		displayName: field.string({
			description: 'Name displayed beside assigned tasks.',
			validation: { required: true },
		}),
		assignedTodos: field.relation({
			description: 'Tasks whose assignee pointer references this user.',
			mappedBy: 'assignee',
			target: 'Todo',
		}),
	}),
})

/** Exercises every built-in field family supported by the Todo application. */
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
		slug: field.string({
			description:
				'Immutable external name used to demonstrate update omission.',
			immutable: true,
		}),
		completed: field.boolean({
			default: false,
			description: 'Whether the task has been completed.',
			validation: { required: true },
		}),
		estimatedMinutes: field.int({
			description: 'Estimated duration represented by a safe integer.',
			validation: { range: { min: 0 } },
		}),
		sequence: field.int({
			autoIncrement: true,
			description: 'Database-generated safe integer sequence.',
		}),
		largeCounter: field.bigint({
			description: 'Arbitrary-precision counter.',
		}),
		largeSequence: field.bigint({
			autoIncrement: true,
			description: 'Database-generated arbitrary-precision sequence.',
		}),
		progress: field.float({
			description: 'Floating-point completion ratio.',
			validation: { finite: true, range: { max: 1, min: 0 } },
		}),
		budget: field.decimal({
			description: 'Exact decimal budget represented without precision loss.',
			validation: { precision: 12, scale: 2 },
		}),
		externalId: field.uuid({
			description: 'Optional UUID supplied by an external system.',
		}),
		dueDate: field.date({
			description: 'Optional calendar date without a time component.',
		}),
		dueAt: field.dateTime({
			description: 'Optional ISO timestamp for the task deadline.',
		}),
		reminderTime: field.time({
			description: 'Optional time of day used for reminders.',
		}),
		attachment: field.binary({
			description: 'Optional immutable byte sequence attached to the task.',
			validation: { length: { max: 5_000_000 } },
		}),
		metadata: field.json({
			description: 'Arbitrary JSON metadata supplied by integrations.',
		}),
		priority: field.enum({
			default: 'medium',
			description: 'Controls the order in which a task should be handled.',
			typeName: 'TodoPriority',
			validation: { required: true },
			values: ['low', 'medium', 'high'],
		}),
		details: field.object({
			description:
				'Structured information used to demonstrate typed JSON paths.',
			fields: (field) => ({
				notes: field.string(),
				visible: field.boolean(),
				position: field.int(),
				largePosition: field.bigint(),
				ratio: field.float(),
				amount: field.decimal(),
				referenceId: field.uuid(),
				calendarDate: field.date(),
				timestamp: field.dateTime(),
				clockTime: field.time(),
				bytes: field.binary(),
				payload: field.json(),
				state: field.enum({
					typeName: 'TodoDetailState',
					values: ['draft', 'ready'],
				}),
				labels: field.string({ list: true }),
				nested: field.object({
					fields: (field) => ({ note: field.string() }),
					typeName: 'TodoNestedDetails',
				}),
			}),
			typeName: 'TodoDetails',
		}),
		tags: field.string({ list: true }),
		completionHistory: field.boolean({ list: true }),
		estimateHistory: field.int({ list: true }),
		largeCounterHistory: field.bigint({ list: true }),
		progressHistory: field.float({ list: true }),
		budgetHistory: field.decimal({ list: true }),
		externalIds: field.uuid({ list: true }),
		availableDates: field.date({ list: true }),
		milestones: field.dateTime({ list: true }),
		reminderTimes: field.time({ list: true }),
		attachments: field.binary({ list: true }),
		metadataHistory: field.json({ list: true }),
		allowedPriorities: field.enum({
			list: true,
			typeName: 'TodoPriority',
			values: ['low', 'medium', 'high'],
		}),
		checklist: field.object({
			fields: (field) => ({
				label: field.string({ validation: { required: true } }),
				done: field.boolean({ default: false }),
			}),
			list: true,
			typeName: 'TodoChecklistItem',
		}),
		assignee: field.pointer({
			description: 'Optional user currently responsible for the task.',
			onDelete: 'setNull',
			target: 'TodoUser',
		}),
	}),
})
