import { defineVoid } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = defineVoid('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) }), { beforeSave: (r) => { const t: string | undefined = r.todo?.title; void t } })
