// Registers a schema written in plain JavaScript next to the TypeScript fixture.
import { App } from '../fixture/app.ts'
import { Tag } from '../fixture/tag.ts'
import { TodoRole } from '../fixture/todo-role.ts'
import { TodoUser } from '../fixture/todo-user.ts'
import { Todo } from '../fixture/todo.ts'
import { Note } from './note.js'

const app = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Note] })
const note = app.registry.find((schema) => schema.className === 'Note')
console.log(JSON.stringify({ fields: note.fields, shape: note.shape, rules: Object.keys(note.rules) }))
