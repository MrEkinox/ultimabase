# Explicit relationship models

Use an ordinary schema when the relationship itself owns application data.
This keeps the edge queryable, hookable, and permission-aware without exposing
database join tables.

```ts
import {
	enumField,
	intField,
	pointerField,
	Schema,
	stringField,
} from '@ultimabase/core'

export const Member = Schema.define({
	className: 'Member',
	fields: {
		name: stringField({ validation: { required: true } }),
	},
})

export const Project = Schema.define({
	className: 'Project',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

export const Membership = Schema.define({
	className: 'Membership',
	fields: {
		member: pointerField({
			onDelete: 'cascade',
			target: () => Member,
			validation: { required: true },
		}),
		position: intField({ default: 0 }),
		project: pointerField({
			onDelete: 'cascade',
			target: () => Project,
			validation: { required: true },
		}),
		role: enumField({
			validation: { required: true },
			values: ['editor', 'viewer'] as const,
		}),
		internalNote: stringField({ access: { read: false } }),
	},
	indexes: [{ fields: ['project', 'member'], unique: true }],
	hooks: {
		beforeCreate: ({ operation }) => {
			// Cross-field edge invariants stay in the ordinary schema lifecycle.
			if (
				operation.kind === 'create-one' &&
				operation.input.role === 'viewer' &&
				(operation.input.position ?? 0) === 0
			) {
				throw new TypeError('The first project member must be an editor')
			}

			return operation
		},
	},
})
```

The unique composite index makes the member/project pair the logical edge
identity. Pointer targets remain exactly typed in create inputs, persisted
models, filters, and selections:

```ts
const membership = await Membership.create({
	data: {
		member: Member.pointer(memberId),
		position: 1,
		project: Project.pointer(projectId),
		role: 'viewer',
	},
})

const projectMembers = await Membership.query()
	.where({ project: { eq: Project.pointer(projectId) } })
	.include('member', (member) => member.select({ id: true, name: true }))
	.select({ id: true, member: true, position: true, role: true })
	.ascending('position')
	.find()
```

Multiple edge writes compose through the same request transaction as every
other schema:

```ts
await request.transaction(async () => {
	const project = await Project.create({ data: { title: 'Relations' } })

	await Membership.create({
		data: {
			member: Member.pointer(memberId),
			project: Project.pointer(project.id),
			role: 'editor',
		},
	})
})
```

Choose `relationField` when the edge has no business data and only needs
connect/disconnect semantics. Choose an explicit schema when the edge needs
fields, uniqueness beyond the pointer pair, direct queries, hooks, Access, or
an independent lifecycle. The PostgreSQL plugin stores this pattern as three
ordinary tables and two ordinary foreign keys; Core never exposes join-table
commands.
