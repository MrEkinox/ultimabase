import { defineThis } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = defineThis('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) }), { filter() { return { todo: { title: 'x' } } satisfies typeof this.where } })
