import type { CreateInput, Model, UpdateInput } from '@ultimabase/core'
import { Todo } from './todo.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// Full-model results (no select, no include).
export const allTodos = await Todo.findMany()
export const openTodos = await Todo.findMany({ where: { archived: { eq: false } }, limit: 10 })
export const oneTodo = await Todo.findOne({ where: { id: { eq: 't1' } } })
export const madeTodo = await Todo.createOne({ data: { title: 'x', status: 'open', archived: false, isDeleted: false, acl: null as never } })
// Partial results (select / include) stay structural.
export const oneTitle = await Todo.findOne({ where: { id: { eq: 't1' } }, select: { title: true } })
export const withAssignee = await Todo.findMany({ include: { assignee: true } })

// Public utility types written with the schema value type.
export declare const model: Model<typeof Todo>
export declare const createInput: CreateInput<typeof Todo>
export declare const updateInput: UpdateInput<typeof Todo>

export type N1 = Expect<Equal<(typeof allTodos)[number], Model<typeof Todo>>>
export type N2 = Expect<Equal<typeof oneTodo, Model<typeof Todo> | null>>
export type N3 = Expect<Equal<typeof madeTodo, Model<typeof Todo>>>
export type N4 = Expect<Equal<(typeof openTodos)[number]['isDeleted'], boolean>>
export type N5 = Expect<Equal<typeof oneTitle, { readonly id: string; readonly title: string } | null>>
export type N6 = Expect<Equal<keyof UpdateInput<typeof Todo>, 'title' | 'archived' | 'priority' | 'allowedPriorities' | 'status' | 'assignee' | 'parent' | 'isDeleted' | 'acl'>>
export type N7 = Expect<Equal<Model<typeof Todo>['priority'], 'low' | 'normal' | 'high' | null>>

// Typo probes on full-model values.
export const firstTitle = allTodos[0]?.title
export const modelTitle = model.title
