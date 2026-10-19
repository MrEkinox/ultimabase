import { Todo } from './todo.ts';
// Full-model results (no select, no include).
export const allTodos = await Todo.findMany();
export const openTodos = await Todo.findMany({ where: { archived: { eq: false } }, limit: 10 });
export const oneTodo = await Todo.findOne({ where: { id: { eq: 't1' } } });
export const madeTodo = await Todo.createOne({ data: { title: 'x', status: 'open', archived: false, isDeleted: false, acl: null } });
// Partial results (select / include) stay structural.
export const oneTitle = await Todo.findOne({ where: { id: { eq: 't1' } }, select: { title: true } });
export const withAssignee = await Todo.findMany({ include: { assignee: true } });
// Typo probes on full-model values.
export const firstTitle = allTodos[0]?.title;
export const modelTitle = model.title;
