import { ultimabase } from './application.ts'
import { Todo } from './schema.ts'
import type { TodoCreateInput } from '../.ultimabase/schema.generated.js'

/** Creates a task while letting schema defaults initialize its state. */
export const createTodo = (data: TodoCreateInput) =>
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
		{ ultimabase },
	)

/** Lists incomplete tasks in deadline order for the application dashboard. */
export const listPendingTodos = () =>
	Todo.findMany(
		{
			orderBy: { dueAt: 'asc', createdAt: 'asc' },
			select: {
				completed: true,
				dueAt: true,
				id: true,
				priority: true,
				title: true,
			},
			where: { completed: { eq: false } },
		},
		{ ultimabase },
	)

/** Marks exactly one task as completed and returns its selected public state. */
export const completeTodo = (id: string) =>
	Todo.updateOne(
		{
			data: { completed: true },
			select: { completed: true, id: true, updatedAt: true },
			where: { id: { eq: id } },
		},
		{ ultimabase },
	)

/** Deletes exactly one task by its immutable identifier. */
export const deleteTodo = (id: string) =>
	Todo.deleteOne(
		{
			select: { id: true, title: true },
			where: { id: { eq: id } },
		},
		{ ultimabase },
	)
