import { define2 } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = define2('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) })).with({ where: (w) => ({ todo: { titl: 'x' } }) })
