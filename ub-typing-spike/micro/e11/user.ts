import { define11 } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = define11('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) }), () => ({ where: (w) => ({ todo: { title: 'x' } }) }))
