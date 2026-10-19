import { field, type Schema } from '../lib.ts'
import { Todo } from './todo.ts'
export const defineG = <const N extends string, const F>(name: N, fields: F): Schema<N, F> => ({ name, fields }) as unknown as Schema<N, F>
export const User = defineG('User', { name: field.string(), get todo() { return field.pointerT(() => Todo) } })
