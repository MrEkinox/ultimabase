// Runtime stub check: registers the fixture schemas with the real (tiny) Core runtime and prints
// what the application collected per schema (fields, shape methods, rules per plugin), then runs
// a few collected rules. Usage: node forms/<id>/runtime-check.mjs [entry.ts]
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const entry = process.argv[2] ?? new URL('./fixture/src/ultimabase.ts', import.meta.url).pathname
const { ultimabase } = await import(pathToFileURL(path.resolve(entry)).href)

const builder = {
	eq: (field, value) => Object.fromEntries([[field, { eq: value }]]),
	ne: (field, value) => Object.fromEntries([[field, { ne: value }]]),
	is: (field, target) => Object.fromEntries([[field, { is: target(builder) }]]),
	some: (field, target) => Object.fromEntries([[field, { some: target(builder) }]]),
	and: (...filters) => ({ AND: filters }),
	object: (filter) => filter,
}
const context = { where: builder, userId: 'u1' }
const callRule = (rule) => (typeof rule === 'function' ? rule.call(context, context) : rule)

for (const schema of ultimabase.describe()) {
	console.log(`\n${schema.className}${schema.factory ? ` (factory ${schema.factory})` : ''}`)
	console.log(`  fields: ${Object.entries(schema.fields).map(([name, kind]) => `${name}:${kind}`).join(', ')}`)
	if (schema.shapeOptions.length > 0) console.log(`  shape options: ${schema.shapeOptions.join(', ')}`)
	for (const [key, value] of Object.entries(schema.rules)) {
		console.log(`  rule ${key}: ${Object.keys(value).join(', ')}`)
	}
}

console.log('\nAccess filters evaluated with a runtime builder (userId u1):')
for (const [className, access] of ultimabase.rulesOf('access')) {
	for (const [operation, rule] of Object.entries(access)) {
		const value = typeof rule === 'object' && rule !== null && 'where' in rule ? callRule(rule.where) : typeof rule === 'function' ? callRule(rule) : rule
		console.log(`  ${className}.${operation}: ${JSON.stringify(value)}`)
	}
}
const hooks = ultimabase.rulesOf('hooks')
const todoHooks = hooks.get('Todo')
try {
	const item = { isDeleted: true }
	todoHooks.beforeUpdate.call({ item, originalItem: null }, { item, originalItem: null })
	console.log('  Todo.beforeUpdate: did not throw (unexpected)')
} catch (error) {
	console.log(`  Todo.beforeUpdate(isDeleted) threw: ${error.message}`)
}
const displayName = hooks.get('TodoUser').fields.displayName.resolveInput
console.log(`  TodoUser.displayName.resolveInput('  Ada  ') = ${JSON.stringify(displayName.call({ value: '  Ada  ' }, { value: '  Ada  ' }))}`)
const acl = ultimabase.rulesOf('acl').get('Todo').default.call({ data: {} }, {})
console.log(`  Todo.acl.default() = ${JSON.stringify([...acl.entries])}`)
console.log(`  postgres(Todo) = ${JSON.stringify(ultimabase.rulesOf('postgres').get('Todo'))}`)

// Negative registration checks (runtime validation mirrors the type-level checks).
const fixture = path.dirname(entry)
const load = async (file) => import(pathToFileURL(path.join(fixture, file)).href)
const { App } = await load('app.ts')
const { TodoUser } = await load('todo-user.ts')
const { TodoRole } = await load('todo-role.ts')
const { Todo } = await load('todo.ts')
const { Tag } = await load('tag.ts')
const attempt = (label, run) => {
	try {
		run()
		console.log(`  ${label}: accepted`)
	} catch (error) {
		console.log(`  ${label}: rejected (${error.message})`)
	}
}
console.log('\nRegistration checks:')
const { AdminRole } = await load('extra.ts')
attempt('second role schema', () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, AdminRole] }))
attempt('no role schema', () => new App({ schemas: [TodoUser, Todo, Tag] }))
attempt('declaration option typo (sofDelete)', () => App.Schema.define({ className: 'Bad', sofDelete: true, fields: () => ({}) }) && new App({ schemas: [TodoUser, TodoRole, Todo, Tag, App.Schema.define({ className: 'Bad', sofDelete: true, fields: () => ({}) })] }))
attempt('rule key without plugin (acess)', () => new App({ schemas: [TodoUser, TodoRole, Todo, App.Schema.define({ className: 'Bad', fields: () => ({}) }).with({ acess: {} })] }))
for (const extra of process.argv.slice(3)) {
	const { [path.basename(extra, path.extname(extra)).replace(/^./, (c) => c.toUpperCase())]: schema } = await import(pathToFileURL(path.resolve(extra)).href)
	attempt(`JavaScript schema ${extra}`, () => {
		const app = new App({ schemas: [TodoUser, TodoRole, Todo, schema] })
		console.log(`    ${JSON.stringify(app.describe().at(-1))}`)
	})
}
