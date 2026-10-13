// Editor probe points (hover texts are recorded by tools/probe.mjs).
import type {
	CreateInput,
	UniqueWhereInput,
	UpdateInput,
} from '@ultimabase/core'

import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'

export const allTodos = await Todo.findMany()
export const oneTodo = await Todo.findOne({ where: { title: { eq: 'x' } } })
export const titles = await Todo.findMany({ select: { title: true } })
export const namedCreate: CreateInput<'Todo'> = { title: 'Write the slice' }
export const schemaCreate: CreateInput<typeof Todo> = {
	title: 'Write the slice',
}
export const namedUpdate: UpdateInput<'Todo'> = { archived: true }

// ADR-0332: unique targets print by name.

export const renameRole = () =>
	TodoRole.updateOne({
		/* hover:unique-where */ where: { name: 'admin' },
		data: { description: 'Administrators' },
	})
export const namedTarget: UniqueWhereInput<'TodoRole'> = { name: 'admin' }
