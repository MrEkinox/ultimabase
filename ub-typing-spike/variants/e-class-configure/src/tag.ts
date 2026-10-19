import { App } from './factory.ts'
import { Todo } from './todo.ts'

export class Tag extends App.Schema('Tag', (field) => ({
	label: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	static readonly options = Tag.configure({ access: { read: true } })
}
