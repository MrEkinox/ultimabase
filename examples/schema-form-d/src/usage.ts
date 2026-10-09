import { Todo } from './todo.ts'

export const run = async () => {
	const todos = await Todo.findMany({
		where: { assignee: { is: { email: { endsWith: '@x.test' } } } },
		include: { assignee: true },
	})
	return todos
}
export const second = async () => {
	const users = await import('./todo-user.ts').then(({ TodoUser }) =>
		TodoUser.findMany({
			where: { assignedTodos: { some: { title: { eq: 'x' } } } },
			select: { email: true },
		}),
	)
	return users
}
export const full = async () => {
	const allTodos = await Todo.findMany()
	const one = await Todo.findOne({ where: { title: { eq: 'x' } } })
	return [allTodos, one] as const
}
