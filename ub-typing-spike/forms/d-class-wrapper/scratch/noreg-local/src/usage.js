import { Tag } from './tag.ts';
import { Todo } from './todo.ts';
import { TodoRole } from './todo-role.ts';
import { TodoUser } from './todo-user.ts';
export const pending = await Todo.findMany({
    where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' } } }, tags: { some: { name: { eq: 'x' } } } },
    select: { title: true, priority: true, status: true },
    include: { assignee: { select: { email: true } }, subtasks: { select: { title: true }, where: { isDeleted: { eq: false } } } },
});
export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { tags: true } } } }, { useMasterKey: true });
const input = { title: 'Write the report', status: 'open', archived: false, isDeleted: false, acl: null, assignee: { connect: 'u1' } };
export const created = await Todo.createOne({ data: input }, { useMasterKey: false });
export const signedUp = await TodoUser.signUp({ displayName: 'Ada', username: 'ada', email: 'ada@x.test', password: 'secret', acl: null });
await TodoRole.addMember({ id: 'r1' }, signedUp);
export const roles = await TodoRole.findMany({ select: { name: true }, include: { members: { select: { displayName: true } } } });
export const tags = await Tag.findMany({ where: { todos: { some: { assignee: { is: { email: { eq: 'a@x.test' } } } } } } });
// @ts-expect-error unknown field in where
await Todo.findMany({ where: { titel: { eq: 'x' } } });
// @ts-expect-error unknown field in an included target select
await Todo.findMany({ include: { assignee: { select: { nickname: true } } } });
// @ts-expect-error unknown field inside a relation filter
await TodoUser.findMany({ where: { assignedTodos: { some: { done: { eq: true } } } } });
// @ts-expect-error wrong value type
await Todo.findMany({ where: { archived: { eq: 'yes' } } });
// @ts-expect-error missing required field on create
await Todo.createOne({ data: { archived: false } });
// @ts-expect-error useMasterKey is a boolean
await Todo.findMany({}, { useMasterKey: 'yes' });
// @ts-expect-error signUp requires the password
await TodoUser.signUp({ displayName: 'A', username: 'a', email: 'a@x.test', acl: null });
// @ts-expect-error value outside the shared enum
await Todo.findMany({ where: { priority: { eq: 'urgent' } } });
// Case 8 marker (query typo): select of a declared field.
export const titles = await Todo.findMany({ select: { title: true } });
