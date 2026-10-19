// Runtime proof for form G: loads the TypeScript fixture with Node's type stripping,
// registers the schemas and prints what registration collected from the class headers
// (fields, shape options) and static members (plugin rules). Also checks that the
// registration rejects a custom static member, an instance method and a second role schema.
// Usage: node forms/g-class/runtime-check.mjs [fixture-dir]
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture'))
const load = (file) => import(pathToFileURL(path.join(dir, file)).href)

const { ultimabase } = await load('ultimabase.ts')
for (const schema of ultimabase.registry) {
	const rules = Object.fromEntries(Object.entries(schema.rules).map(([name, options]) => [name, Object.keys(options)]))
	console.log(`${schema.className}${schema.factory ? ` (App.${schema.factory})` : ''}`)
	console.log(`  fields: ${schema.fields.join(', ')}`)
	console.log(`  shape:  ${JSON.stringify(schema.shape)}`)
	console.log(`  rules:  ${JSON.stringify(rules)}`)
}

// Rules are inert data: a filter callback runs only when Runtime calls it.
const { Todo } = await load('todo.ts')
const calls = []
const builder = { eq: (field, value) => (calls.push(['eq', field, value]), { field, value }) }
Todo.access.options.read.where(builder, { userId: null })
console.log(`\nTodo.access.read.where(builder) -> ${JSON.stringify(calls)}`)
console.log(`Todo frozen rule declaration: ${Object.isFrozen(Todo.access)}`)

const { App, field } = await load('app.ts')
const { TodoUser } = await load('todo-user.ts')
const { TodoRole } = await load('todo-role.ts')
const { Tag } = await load('tag.ts')
const expectFailure = (label, create) => {
	try {
		create()
		console.log(`${label}: NOT rejected`)
		process.exitCode = 1
	} catch (error) {
		console.log(`${label}: rejected (${error.message})`)
	}
}
class WithStatic extends App.Schema('WithStatic', { name: field.string() }) {
	static complete() {
		return 1
	}
}
class WithMethod extends App.Schema('WithMethod', { name: field.string() }) {
	label() {
		return 'x'
	}
}
class WrongName extends App.Schema('WrongName', { name: field.string() }) {
	static hooks = this.rules.access({ read: true })
}
const { SecondRole } = await load('extra.ts')
expectFailure('custom static method', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, WithStatic] }))
expectFailure('instance method', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, WithMethod] }))
expectFailure('rule under another name', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, WrongName] }))
expectFailure('second role schema', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, SecondRole] }))
expectFailure('missing role schema', () => new App({ schemas: [TodoUser, Todo, Tag] }))
expectFailure('unknown shape option', () => App.Schema('Bad', {}, { sofDelete: true }))
