import { TodoUser } from './todo-user.ts';
import { Todo } from './todo.ts';
export const pending = await Todo.findMany({
    where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' }, assignedTodos: { some: { title: { eq: 'x' } } } } }, tags: { some: { name: { eq: 'x' } } } },
    select: { title: true },
    include: { assignee: { select: { email: true }, include: { assignedTodos: { select: { title: true } } } }, subtasks: true },
});
export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { tags: true } } } });
// @ts-expect-error cross-schema field typo
await Todo.findMany({ where: { assignee: { is: { emial: { eq: 'x' } } } } });
