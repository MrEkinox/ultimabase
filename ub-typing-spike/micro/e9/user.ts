import { define9 } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = define9('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) }), { where: (w) => ({ todo: { title: 'x' } }) })
