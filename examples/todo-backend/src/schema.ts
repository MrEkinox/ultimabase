import { ACL } from '@ultimabase/acl-permissions-plugin'
import { allMutations } from '@ultimabase/access-plugin'
import { Schema } from '@ultimabase/core'
import { RoleSchema } from '@ultimabase/roles-plugin'

const serverManagedAccess = {
	read: true,
	...allMutations(false),
}

/** Owns tasks assigned to one person and demonstrates inverse relations. */
export const TodoUser = Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		displayName: field.string({
			description: 'Name displayed beside assigned tasks.',
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			postgres: { renamedFrom: 'name' },
			required: true,
		}),
		assignedTodos: field.relation({
			description: 'Tasks whose assignee pointer references this user.',
			mappedBy: 'assignee',
			target: 'Todo',
		}),
	}),
	access: serverManagedAccess,
	postgres: { table: 'todo_users' },
})

/** Stores application roles with ordinary schema fields and model commands. */
export const TodoRole = RoleSchema.define({
	className: 'TodoRole',
	members: { schema: TodoUser },
	deletion: { references: 'fail' },
	fields: (field) => ({
		description: field.string({
			description: 'Human-readable explanation of the role.',
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
		}),
		priority: field.int({
			default: 0,
			description: 'Display priority for administrative role lists.',
		}),
	}),
	indexes: [{ fields: ['priority', 'createdAt'] }],
	access: serverManagedAccess,
	postgres: { table: 'todo_roles' },
})

/** Stable role reference used by ACL defaults without loading role storage. */
export const TodoEditorRole = TodoRole.role('editor')

/** Exercises every built-in field family supported by the Todo application. */
export const Todo = Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({
			description: 'Short task summary shown in todo lists.',
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			postgres: { renamedFrom: 'summary' },
			required: true,
			validation: { length: { max: 200 } },
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
			required: true,
		}),
		archived: field.boolean({
			default: false,
			description: 'Hides a task from ordinary public reads.',
			required: true,
		}),
		internalNotes: field.string({
			access: {
				read: false,
				write: false,
			},
			description: 'Server-only notes omitted from untrusted reads and writes.',
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
			required: true,
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
				label: field.string({ required: true }),
				done: field.boolean({ default: false }),
			}),
			list: true,
			typeName: 'TodoChecklistItem',
		}),
		assignee: field.pointer({
			access: {
				write: false,
			},
			description: 'Optional user currently responsible for the task.',
			onDelete: 'setNull',
			target: 'TodoUser',
		}),
	}),
	indexes: [{ fields: ['completed', 'dueAt'] }],
	access: {
		read: { where: ({ where }) => where.eq('archived', false) },
		create: false,
		update: true,
		upsert: false,
		delete: false,
	},
	acl: {
		default: new ACL()
			.grantPublic('read')
			.grantRole(TodoEditorRole, 'read', 'update'),
	},
	hooks: {
		beforeOperation: {
			update: ({ item, originalItem }) => {
				if (originalItem.completed && !item.completed) {
					throw new TypeError('Completed todos cannot be reopened')
				}
			},
		},
	},
	postgres: { table: 'todos' },
})
