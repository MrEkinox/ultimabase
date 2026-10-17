# Todo backend

The reference UltimaBase application: a Todo backend that combines ordinary
schemas and queries with the official Access, ACL, Hooks, Roles, Validation,
PostgreSQL and REST plugins, written in the declaration form
without generated files, and tested with `testApplication`.
[`src/app.ts`](src/app.ts) installs every plugin once and imports no schema,
[`src/schema.ts`](src/schema.ts) declares the schemas and their rules,
[`src/ultimabase.ts`](src/ultimabase.ts) creates the application and
[`src/todos.ts`](src/todos.ts) holds the typed backend code.

## Test

[`tests/todos.test.ts`](tests/todos.test.ts) starts the application itself
with `testApplication` on its own PostgreSQL schema; each test starts from
empty tables:

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

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_todo \
	corepack yarn workspace @ultimabase/example-todo-backend dev
corepack yarn workspace @ultimabase/example-todo-backend typecheck
corepack yarn workspace @ultimabase/example-todo-backend test
```

`dev` restarts on change and reads an optional `.env`; REST listens on
`http://127.0.0.1:1337/api/classes/Todo`. `test` starts PostgreSQL in a
container once (Docker), or uses `TEST_DATABASE_URL`. The PostgreSQL
`override` schema policy (the default outside production) is not a production
migration strategy.

## Documentation

- [Test an Application](../../apps/website/content/docs/1.0.0/guides/test-an-application.mdx)
- [Access](../../apps/website/content/docs/1.0.0/plugins/official/access.mdx),
  [ACL Permissions](../../apps/website/content/docs/1.0.0/plugins/official/acl-permissions.mdx),
  [Roles](../../apps/website/content/docs/1.0.0/plugins/official/roles.mdx),
  [Hooks](../../apps/website/content/docs/1.0.0/plugins/official/hooks.mdx) and
  [Validation](../../apps/website/content/docs/1.0.0/plugins/official/validation.mdx)
- [API Errors](../../apps/website/content/docs/1.0.0/core/runtime/api-errors.mdx)
