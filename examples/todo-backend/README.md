# Todo backend

The reference UltimaBase application: a Todo backend that combines ordinary
schemas and queries with the official Access, ACL, Hooks, Roles, Validation,
PostgreSQL and REST plugins, written in the declaration form (ADR-0297)
without generated files, and tested with `testApplication` (ADR-0327).

## What the developer writes

[`src/schema.ts`](src/schema.ts) installs every plugin once and declares the
schemas. Field behavior sits on the field; schema rules sit in a final
`.with(...)`:

```ts
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	validationPlugin(),
	rolesPlugin(),
	aclPlugin(),
	...apiServer({ rest: true }),
	postgresPlugin(),
)

export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
			postgres: { renamedFrom: 'summary' },
			required: true,
			validation: z.string().max(200),
		}),
		internalNotes: field.string({ access: { read: false, write: false } }),
		assignee: field.pointer({
			access: { write: false },
			onDelete: 'setNull',
			target: () => TodoUser,
		}),
		// ...every built-in scalar and list field family
	}),
	indexes: [{ fields: ['completed', 'dueAt'] }],
})
	.acl()
	.with({
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
```

Relation targets are thunks (`target: () => TodoUser`), so schemas reference
each other across the file without names to keep in sync. Every option is
typed from the plugins installed on `App`: removing a plugin makes its
options unknown at once. The plugins compose monotonically: ordinary readers
see only non-archived tasks their ACL allows, an editor's role may update
them, and `internalNotes` stays server-only. Master bypasses Access and ACL,
never validation or hooks, and is never accepted from transport input.

The same file also declares:

- `TodoUser`, the assignee, with an inverse `assignedTodos` relation;
- `TodoRole`, from `App.RoleSchema.define()` with custom fields, an index, and
  `ensure: ['editor']`, since the Todo ACL default grants that role;
- an enum shared by two fields, nested typed objects, JSON paths and a
  composite index.

[`src/application.ts`](src/application.ts) creates the application with an
audited Master authority (`ULTIMABASE_MASTER_KEY`) and declares it once in
`Register`, which gives name-keyed types such as `CreateInput<'Todo'>`:

```ts
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'todo-backend', value: masterKey }],
		onUse,
	}),
	schemas: [TodoUser, TodoRole, Todo],
})

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

## Typed backend code

[`src/todos.ts`](src/todos.ts) and [`src/admin.ts`](src/admin.ts) use the
schema-root query and mutation API; selections and includes narrow the
resolved types, and application code never imports PostgreSQL or Drizzle:

```ts
export const createTodo = (data: CreateInput<'Todo'>) =>
	Todo.createOne(
		{
			data,
			select: { completed: true, id: true, priority: true, title: true },
		},
		{ useMasterKey: true },
	)

export const listPendingTodos = () =>
	Todo.findMany({
		include: { assignee: { select: { displayName: true } } },
		orderBy: { dueAt: 'asc', createdAt: 'asc' },
		where: { completed: { eq: false } },
	})
```

`addUserToRole` links members through the checked `connect` command, and
`grantTodoToUser` replaces an immutable ACL with a newly granted one.

## Tests

[`tests/todos.test.ts`](tests/todos.test.ts) starts the application itself
with `testApplication` on its own PostgreSQL schema; each test starts from
empty tables, with the `editor` role created again by Roles:

```ts
it('lets an editor update a task through its role and the ACL', async () => {
	await using t = await testApplication(ultimabase)
	// ...create the task, the user and the membership
	expect(await t.as(undefined, update)).toBeNull()
	expect(await t.as(TodoUser.pointer(user.id), update)).toMatchObject({
		description: 'Reviewed',
	})
})
```

The tests also cover the hook that refuses to reopen a task and the REST
route, called in memory with `t.fetch`.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_todo \
ULTIMABASE_MASTER_KEY=development-only-secret \
	corepack yarn workspace @ultimabase/example-todo-backend dev
corepack yarn workspace @ultimabase/example-todo-backend typecheck
corepack yarn workspace @ultimabase/example-todo-backend test
```

`dev` runs the TypeScript sources with Node 24 and restarts on change; REST
listens on `http://127.0.0.1:1337/api/classes/Todo`. `test` starts PostgreSQL
in a container once (Docker), or uses `TEST_DATABASE_URL`.

The PostgreSQL `override` schema policy (the default outside production) is
convenient for this development example and is not a production migration
strategy.
