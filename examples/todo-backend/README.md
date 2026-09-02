# Todo backend

A backend-only UltimaBase application designed as a complete developer-experience
showcase. It combines ordinary schemas and queries with the official Access,
ACL, Hooks, Roles, Validation, PostgreSQL, and Typegen plugins without adapter-specific
application code.

## What the developer writes

[`src/schema.ts`](src/schema.ts) is the authoritative application declaration.
Plugin behavior is configured directly beside the schema or field that owns it:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

export const Todo = Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({
			hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
			postgres: { renamedFrom: 'summary' },
			required: true,
			validation: z.string().max(200),
		}),
		tags: field.string({
			list: true,
			validation: z.array(z.string().min(1)).max(20),
		}),
		slug: field.string({
			hooks: {
				resolveInput: ({ value }) =>
					value?.trim().toLowerCase().replace(/\s+/gu, '-') ?? null,
			},
			validation: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/u),
		}),
		internalNotes: field.string({
			access: {
				read: false,
				write: false,
			},
		}),
	}),
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
	postgres: { table: 'todos' },
})

// Direct options are active only because the application installs their owners.
const ultimabase = new UltimaBase({
	plugins: [
		accessPlugin({ default: true }),
		hooksPlugin(),
		validationPlugin() /* ACL, Roles, Typegen, PostgreSQL */,
	],
	schemas: [TodoUser, TodoRole, Todo],
})
```

`required` remains direct presence metadata, while `precision` and `scale` on
the Todo budget remain direct storage shape. A scalar validator receives one
canonical title, and the `tags` validator receives the complete canonical list
once. Zod diagnostics are exposed through UltimaBase's neutral
`field.validation` issue code; the generated `TodoItem` still contains
`readonly tags: ReadonlyArray<string> | null` and never embeds the validator.
The slug demonstrates the transformation boundary: Core first accepts a
structurally valid string, the field Hook rewrites it, and the Validation
plugin's final mutation guard accepts only the canonical lowercase hyphenated form.
It remains an ordinary `field.string()` rather than requiring a `slugField`
factory or an additional Runtime plugin.

This pass is the only time application field validators execute. Listing or
including existing todos, snapshotting PostgreSQL results, and materializing
Hook outcomes retain Core structural checks without replaying Zod. Atomic
changes to validated numeric fields check the complete value projected from the
locked todo while preserving the database delta.

This demonstrates that the plugins compose monotonically: ordinary readers see
only non-archived rows allowed by their object ACL, editor ACLs may permit an
update, and the field-level Access declaration still keeps `internalNotes`
server-only. `false` denies ordinary callers while trusted master authority
bypasses Access and ACL authorization. Master is never a value accepted from
transport input.

The same file also contains:

- every built-in scalar and supported list field;
- nested typed objects, enums, JSON paths, a pointer, and an inverse relation;
- a composite index and PostgreSQL table/rename metadata;
- field `resolveInput` Hooks and a schema business Hook that rejects reopening
  completed tasks;
- `TodoRole`, declared through `RoleSchema.define()`, with custom fields,
  indexes, Access, Hooks, PostgreSQL options, members, and nested roles;
- an ACL-injected reserved field without declaring `acl` manually.

[`src/create-application.ts`](src/create-application.ts) installs the behavior
explicitly. Importing a plugin package alone changes nothing:

```ts
new UltimaBase({
	plugins: [
		accessPlugin({ default: true }),
		hooksPlugin(),
		validationPlugin(),
		rolesPlugin(),
		aclPlugin(),
		typegenPlugin({ applicationId: 'todo-backend', outputPath }),
		postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
	],
	schemas: [TodoUser, TodoRole, Todo],
})
```

The `createTodoPlugins()` and `todoSchemas` exports keep the Runtime composition
in one application-owned place.

## Typed backend code

[`src/todos.ts`](src/todos.ts) shows schema-root query and mutation APIs:

```ts
export const createTodo = (data: TodoCreateInput) =>
	Todo.createOne(
		{
			data,
			select: { completed: true, id: true, priority: true, title: true },
		},
		{ ultimabase, useMasterKey: true },
	)

export const listPendingTodos = () =>
	Todo.findMany(
		{
			include: { assignee: { select: { displayName: true } } },
			orderBy: { dueAt: 'asc', createdAt: 'asc' },
			where: { completed: { eq: false } },
		},
		{ ultimabase },
	)
```

Selections and includes narrow the resolved return type. Application code never
imports PostgreSQL or Drizzle query builders.

[`src/admin.ts`](src/admin.ts) demonstrates plugin-added behavior on ordinary
models:

```ts
const editor = await createTodoRole('editor', 'Can update assigned tasks')
await editor.addMember(TodoUser.pointer(userId), masterOptions)
await administrator.addRole(editor, masterOptions)

const nextACL = todo.acl.grantPrincipal(
	TodoUser.pointer(userId),
	'read',
	'update',
)
```

Role commands are available only on persisted `TodoRole` results. ACL values
are immutable, so an update replaces the value with a newly granted ACL.

## What Typegen produces

The complete committed output is
[`schema.generated.d.ts`](.ultimabase/schema.generated.d.ts). It is generated
from the compiled application graph and is never Runtime truth. Its opening
imports show which installed plugins contributed types:

```ts
import type {
	FieldAccessOption,
	SchemaAccessOption,
} from '@ultimabase/access-plugin'
import type { ACL, ACLSchemaOption } from '@ultimabase/acl-permissions-plugin'
import type {
	FieldHooksOption,
	SchemaHooksOption,
} from '@ultimabase/hooks-plugin'
import type {
	PostgresFieldOption,
	PostgresSchemaOption,
} from '@ultimabase/postgres-plugin'
import type {
	FieldValidationCompatibility,
	FieldValidationOption,
} from '@ultimabase/validation-plugin'
```

The generated application contracts include exact object and operation shapes:

```ts
export type TodoItem = {
	readonly acl: ACL
	readonly archived: boolean
	readonly assignee: Core.GeneratedPointerHandle<'TodoUser'> | null
	readonly completed: boolean
	readonly internalNotes: string | null
	readonly priority: TodoPriority
	readonly title: string
	// ...all remaining declared and framework fields
}

export type TodoCreateInput = {
	readonly acl?: ACL // optional because acl.default resolves it
	readonly archived?: boolean
	readonly assignee?: Core.PointerValue | null
	readonly priority?: TodoPriority
	readonly title: string
	// ...
}

export type TodoRoleWhereInput = {
	readonly members?: RelationFilter<TodoUserWhereInput>
	readonly roles?: RelationFilter<TodoRoleWhereInput>
	// ...scalar filters
}
```

It also emits `TodoUpdateInput`, `TodoWhereInput`, `TodoSelect`,
`TodoOrderByInput`, `TodoInclude`, their `TodoUser` and `TodoRole` equivalents,
all nested object/path/filter types, and the flat `Schemas` registry. At the
bottom, module augmentation adds only the options supplied by the installed
plugins:

```ts
interface UltimaBaseGeneratedFieldOptions {
	readonly access?: FieldAccessOption<this>
	readonly hooks?: FieldHooksOption<this>
	readonly postgres?: PostgresFieldOption
}

interface UltimaBaseGeneratedSchemaOptions {
	readonly access?: SchemaAccessOption<this>
	readonly acl?: ACLSchemaOption<this>
	readonly hooks?: SchemaHooksOption<this>
	readonly postgres?: PostgresSchemaOption
}
```

Removing a plugin makes its direct option unknown at application compilation
and removes its autocomplete contract from the next generated declaration.

## Run and verify it

Build the repository packages once, provide a development PostgreSQL database,
then start the example from the repository root:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_todo \
	corepack yarn workspace @ultimabase/example-todo-backend start
```

`await ultimabase.start()` compiles the static graph and atomically regenerates
the declaration before PostgreSQL connects. Verify the application source
against it with:

```sh
corepack yarn workspace @ultimabase/example-todo-backend typecheck
```

The packed Typegen E2E suite independently rebuilds this complete official
plugin graph and fails if the committed declaration drifts.

The PostgreSQL `override` schema policy is intentionally convenient for this
development example and should not be copied into a production migration
strategy.
