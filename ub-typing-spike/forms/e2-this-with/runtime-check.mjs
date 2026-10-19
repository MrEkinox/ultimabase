// Runs the fixture's TypeScript schema files (types stripped by node) against the runtime
// stub, prints what registration collected, then checks the runtime rejections.
// Usage: node forms/e1-annotated/runtime-check.mjs
import { register } from 'node:module'

register('./runtime/loader.mjs', import.meta.url)

const { ultimabase } = await import('./fixture/src/ultimabase.ts')
const { App } = await import('./fixture/src/app.ts')
const { Todo } = await import('./fixture/src/todo.ts')
const { TodoUser } = await import('./fixture/src/todo-user.ts')
const { TodoRole } = await import('./fixture/src/todo-role.ts')
const { Tag } = await import('./fixture/src/tag.ts')

for (const schema of ultimabase.registered) {
	console.log(`${schema.className}${schema.factory ? ` (factory ${schema.factory})` : ''}`)
	console.log(`  fields: ${schema.fields.join(', ')}`)
	console.log(`  rules:  ${Object.entries(schema.rules).map(([key, value]) => `${key}{${value.join(',')}}`).join(' ')}`)
}

const expectThrow = (label, run) => {
	try {
		run()
		console.log(`UNEXPECTED: ${label} did not throw`)
		process.exitCode = 1
	} catch (error) {
		console.log(`rejected (${label}): ${error.message.replace(/\s+/g, ' ').slice(0, 160)}`)
	}
}

class ExtraRole extends App.RoleSchema('ExtraRole', { members: () => TodoUser }) {}
class ActiveTodo extends App.Schema('ActiveTodo', (field) => ({ title: field.string() })) {
	static archiveAll() {}
	save() {}
}
class Unknown extends App.Schema('Unknown', (field) => ({ title: field.string() })) {
	static options = this.with({ acess: { read: true } })
}
class Borrowed extends App.Schema('Borrowed', (field) => ({ title: field.string() })) {
	static options = Unknown.with({})
}
expectThrow('second RoleSchema', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ExtraRole] }))
expectThrow('custom members', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ActiveTodo] }))
expectThrow('unknown rule key', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Unknown] }))
expectThrow('options of another class', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Borrowed] }))
expectThrow('rules changed after registration', () => {
	'use strict'
	Todo.options = {}
})

// JavaScript copy of one schema file: the same code, no annotation needed.
const { JsTag } = await import('./js/tag.mjs')
const jsApp = new App({ schemas: [TodoUser, TodoRole, Todo, JsTag] })
console.log(`JS schema registered: ${JSON.stringify(jsApp.registered.find((schema) => schema.className === 'JsTag'))}`)
