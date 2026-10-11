import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase, defineEnum } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

const serverManagedAccess = {
	read: true,
	create: false,
	update: false,
	upsert: false,
	delete: false,
}
const TodoSchemaApplication = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(validationPlugin())
	.use(rolesPlugin())
	.use(aclPlugin())

/** Owns tasks assigned to one person and demonstrates inverse relations. */
export const TodoUser = TodoSchemaApplication.Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		displayName: field.string({
			description: 'Name displayed beside assigned tasks.',
			hooks: { resolveInput: ({ value }) => value.trim() },
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
export const TodoRole = RoleSchema.define(TodoSchemaApplication.Schema, {
	className: 'TodoRole',
	members: { schema: TodoUser },
	deletion: { references: 'fail' },
	fields: (field) => ({
		description: field.string({
			description: 'Human-readable explanation of the role.',
			hooks: { resolveInput: ({ value }) => value.trim() },
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

/** Task priorities, shared by `priority` and `allowedPriorities` as one named type. */
export const TodoPriority = defineEnum('TodoPriority', [
	'low',
	'medium',
	'high',
])

/** Exercises every built-in field family supported by the Todo application. */
export const Todo = TodoSchemaApplication.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({
			description: 'Short task summary shown in todo lists.',
			hooks: { resolveInput: ({ value }) => value.trim() },
			postgres: { renamedFrom: 'summary' },
			required: true,
			validation: z.string().max(200),
		}),
		description: field.string({
			description: 'Optional details needed to complete the task.',
		}),
		slug: field.string({
			description:
				'Immutable external name used to demonstrate update omission.',
			hooks: {
				// Field hooks run only for a non-null value (ADR-0318).
				resolveInput: ({ value }) =>
					value.trim().toLowerCase().replace(/\s+/gu, '-'),
			},
			immutable: true,
			validation: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/u),
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
			validation: z.number().int().nonnegative(),
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
			validation: z.number().min(0).max(1),
		}),
		budget: field.decimal({
			description: 'Exact decimal budget represented without precision loss.',
			precision: 12,
			scale: 2,
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
			validation: z
				.custom<Uint8Array>((value) => value instanceof Uint8Array)
				.refine((value) => value.byteLength <= 5_000_000, {
					message: 'Attachment must not exceed 5 MB',
				}),
		}),
		metadata: field.json({
			description: 'Arbitrary JSON metadata supplied by integrations.',
		}),
		priority: field.enum({
			default: 'medium',
			description: 'Controls the order in which a task should be handled.',
			required: true,
			values: TodoPriority,
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
				state: field.enum({ values: ['draft', 'ready'] }),
				labels: field.string({ list: true }),
				nested: field.object({
					fields: (field) => ({ note: field.string() }),
					typeName: 'TodoNestedDetails',
				}),
			}),
			typeName: 'TodoDetails',
		}),
		tags: field.string({
			list: true,
			validation: z.array(z.string().min(1)).max(20),
		}),
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
		allowedPriorities: field.enum({ list: true, values: TodoPriority }),
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
		read: ({ where }) => where.eq('archived', false),
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
