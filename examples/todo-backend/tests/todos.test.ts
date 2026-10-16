import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { addUserToRole, createTodoUser } from '../src/admin.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { Todo, TodoRole, TodoUser } from '../src/schema.ts'
import { completeTodo, createTodo, listPendingTodos } from '../src/todos.ts'

it('creates, lists and completes a task', async () => {
	await using t = await testApplication(ultimabase)
	const todo = await createTodo({ slug: 'Write Docs', title: '  Write docs ' })
	// The field hook trimmed the title before Validation checked it.
	expect(todo).toMatchObject({ completed: false, title: 'Write docs' })
	expect((await listPendingTodos()).map(({ title }) => title)).toStrictEqual([
		'Write docs',
	])

	await completeTodo(todo.id)
	expect(await listPendingTodos()).toStrictEqual([])
	await t.afterCommit()
})

it('refuses to reopen a completed task', async () => {
	await using t = await testApplication(ultimabase)
	const todo = await createTodo({ title: 'Ship' })
	await completeTodo(todo.id)
	await expect(
		t.asMaster(() =>
			Todo.updateOne({
				data: { completed: false },
				where: { id: { eq: todo.id } },
			}),
		),
	).rejects.toThrow()
})

//#region editor-update
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
//#endregion editor-update

it('serves tasks over REST without their server-only notes', async () => {
	await using t = await testApplication(ultimabase)
	await createTodo({ internalNotes: 'secret', title: 'Public' })
	const response = await t.fetch('/api/classes/Todo?select=title,internalNotes')
	expect(response.status).toBe(403)
	const listed = await t.fetch('/api/classes/Todo?select=title')
	expect(await listed.json()).toMatchObject({ results: [{ title: 'Public' }] })
})
