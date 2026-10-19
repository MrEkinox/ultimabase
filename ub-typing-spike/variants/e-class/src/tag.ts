import { App, type Options } from './factory.ts'
import { Todo } from './todo.ts'

export class Tag extends App.Schema('Tag', (field) => ({
	label: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	static readonly options: Options<typeof Tag> = ({ access: { read: true } })
}
