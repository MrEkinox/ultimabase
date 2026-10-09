// Editor probe points (hover texts are recorded by tools/probe.mjs).
import type { CreateInput } from '@ultimabase/core'

import { Todo } from './todo.ts'

export const allTodos = await Todo.findMany()
export const oneTodo = await Todo.findOne({ where: { title: { eq: 'x' } } })
export const titles = await Todo.findMany({ select: { title: true } })
export const namedCreate: CreateInput<'Todo'> = { title: 'Write the slice' }
export const schemaCreate: CreateInput<typeof Todo> = {
	title: 'Write the slice',
}
