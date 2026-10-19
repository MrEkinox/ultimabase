// Custom static helper and instance method on a schema class (TS7 experiment).
import { Todo } from './todo.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false

export const overdue = await Todo.findOverdue()
export const titles = await Todo.findMany({ select: { title: true } })
export const full = await Todo.findMany()
export const one = await Todo.findOne({ where: { title: { eq: 'x' } } })

export type OverdueHasMethod = (typeof overdue)[number] extends { isLate(): boolean } ? true : false
export type TitlesHaveMethod = (typeof titles)[number] extends { isLate(): boolean } ? true : false
export type FullHasMethod = (typeof full)[number] extends { isLate(): boolean } ? true : false
export type OverdueIsFull = Equal<(typeof overdue)[number], (typeof full)[number]>
export const titleLate = titles[0]?.isLate()
export const fullLate = full[0]?.isLate()
export const annotated: Todo | null = one
export const completion = Todo.findOverdue
