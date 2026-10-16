# Todo backend

The reference UltimaBase application: a Todo backend that combines ordinary
schemas and queries with the official Access, ACL, Hooks, Roles, Validation,
PostgreSQL and REST plugins, written in the declaration form (ADR-0297)
without generated files, and tested with `testApplication` (ADR-0327).

## What the developer writes

[`src/schema.ts`](src/schema.ts) installs every plugin once and declares the
schemas. The block below shows the plugin list, then the `title` field of
`Todo`, whose behavior sits on the field, and the end of `Todo`: its
`indexes` and the `acl: true` feature key in `define`, then the schema rules
in `.with({ ... })` (ADR-0339):

<!-- region src/schema.ts#factory,todo-title,todo-rules -->

```ts
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { PublicError, UltimaBase, defineEnum } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

/**
 * One plugin list types every schema and builds the application.
 * Every schema rules every operation, so Access opens nothing by default.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	validationPlugin(),
	rolesPlugin(),
	aclPlugin(),
	// REST over HTTP and a local Hono listener; Access decides
	// what each request may do.
	...apiServer({ rest: true }),
	postgresPlugin(),
)

title: field.string({
	description: 'Short task summary shown in todo lists.',
	hooks: { resolveInput: ({ value }) => value.trim() },
	postgres: { renamedFrom: 'summary' },
	required: true,
	validation: z.string().max(200),
}),

	indexes: [{ fields: ['completed', 'dueAt'] }],
	acl: true,
}).with({
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
					// A PublicError reaches REST and GraphQL clients; any other
					// error is masked as an internal error.
					throw new PublicError('Completed todos cannot be reopened.', {
						code: 'todo.reopen',
					})
				}
			},
		},
	},
	postgres: { table: 'todos' },
})
```

<!-- endregion -->

Relation targets are thunks (`target: () => TodoUser`), so schemas reference
each other across the file without names to keep in sync. Every option is
typed from the plugins installed on `App`: removing a plugin makes its
options unknown at once. The plugins compose monotonically: ordinary readers
see only non-archived tasks their ACL allows, an editor's role may update
them, and `internalNotes` stays server-only. Master bypasses Access and ACL,
never validation or hooks, and is never accepted from transport input.

The same file also declares:

- `TodoUser`, the assignee, with an inverse `assignedTodos` relation;
- `TodoRole`, from `App.RoleSchema.define()` with custom fields and an index,
  and `roles: { ensure: ['editor'] }` in its `.with`, since the Todo
  ACL default grants that role;
- an enum shared by two fields, nested typed objects, JSON paths and a
  composite index.

[`src/application.ts`](src/application.ts) creates the application with an
audited Master authority (`ULTIMABASE_MASTER_KEY`) and declares it once in
`Register`, which gives name-keyed types such as `CreateInput<'Todo'>`:

<!-- region src/application.ts#application -->

```ts
export const ultimabase = new App({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'todo-backend', value: masterKey }],
		onUse: (event) => {
			// Replace this console record with a durable audit sink in production.
			console.info('Master authority used', {
				kind: event.kind,
				reason: event.reason,
				requestId: event.requestId,
			})
		},
	}),
	schemas: [TodoUser, TodoRole, Todo],
})

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

<!-- endregion -->

## Typed backend code

[`src/todos.ts`](src/todos.ts) and [`src/admin.ts`](src/admin.ts) use the
schema-root query and mutation API; selections and includes narrow the
resolved types, and application code never imports PostgreSQL or Drizzle:

<!-- region src/todos.ts#create-and-list -->

```ts
/** Creates a task while letting schema defaults initialize its state. */
export const createTodo = (data: CreateInput<'Todo'>) =>
	Todo.createOne(
		{
			data,
			select: {
				completed: true,
				createdAt: true,
				id: true,
				priority: true,
				title: true,
			},
		},
		{ useMasterKey: true },
	)

/** Lists incomplete tasks in deadline order for the application dashboard. */
export const listPendingTodos = () =>
	Todo.findMany({
		include: {
			assignee: { select: { displayName: true } },
		},
		orderBy: { dueAt: 'asc', createdAt: 'asc' },
		select: {
			completed: true,
			dueAt: true,
			id: true,
			priority: true,
			title: true,
		},
		where: { completed: { eq: false } },
	})
```

<!-- endregion -->

`addUserToRole` links members through the checked `connect` command, and
`grantTodoToUser` replaces an immutable ACL with a newly granted one.

## Tests

[`tests/todos.test.ts`](tests/todos.test.ts) starts the application itself
with `testApplication` on its own PostgreSQL schema; each test starts from
empty tables, with the `editor` role created again by Roles:

<!-- region tests/todos.test.ts#editor-update -->

```ts
it('lets an editor update a task through its role and the ACL', async () => {
	await using t = await testApplication(ultimabase)
	const todo = await createTodo({ title: 'Review' })
	const user = await createTodoUser({ displayName: 'Ada' })
	// Roles created the `editor` role at start (`ensure`), and again after
	// each reset.
	const editor = await t.asMaster(() =>
		TodoRole.findOneOrThrow({ where: { name: { eq: 'editor' } } }),
	)
	await addUserToRole(editor.id, user.id)
	const update = () =>
		Todo.updateOne({
			data: { description: 'Reviewed' },
			select: { description: true },
			where: { id: { eq: todo.id } },
		})

	// The ACL grants anonymous callers reads only: no task to update.
	expect(await t.as(undefined, update)).toBeNull()
	expect(await t.as(TodoUser.pointer(user.id), update)).toMatchObject({
		description: 'Reviewed',
	})
})
```

<!-- endregion -->

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

`dev` runs the TypeScript sources with Node 24 and restarts on change, reading
an optional `.env`; REST
listens on `http://127.0.0.1:1337/api/classes/Todo`. `test` starts PostgreSQL
in a container once (Docker), or uses `TEST_DATABASE_URL`.

The PostgreSQL `override` schema policy (the default outside production) is
convenient for this development example and is not a production migration
strategy.
