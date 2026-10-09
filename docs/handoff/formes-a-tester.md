# Formes de déclaration de schéma à comparer

Base du protocole de comparaison (séance du 2026-10-09). Chaque forme déclare le
même `Todo` : titre, `archived`, pointeur vers `TodoUser`, `softDelete` (ajoute
`isDeleted`), lecture filtrée, mise à jour réservée à la personne assignée
(filtre croisé vers `TodoUser`), hook qui lit `isDeleted`. `TodoUser` déclare
la relation inverse vers `Todo` et un filtre croisé vers `Todo` (cycle dans
les deux sens).

Configuration commune (sauf mention) :

```ts
export const App = UltimaBase.use(
	postgresPlugin(),
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
)
```

## Famille « objet `define` »

### D — hybride : méthodes de forme, `.with()` final pour les règles

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
})
	.softDelete()
	.with({
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where, userId }) =>
					where.is('assignee', (user) => user.eq('id', userId)),
			},
		},
		hooks: {
			beforeUpdate: ({ item }) => {
				if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
			},
		},
	})

// Une fois par application, pour des infobulles courtes (facultatif) :
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

### A′ — options de forme dans `define`, règles dans `.with()`

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
}).with({
	access: {
		read: { where: ({ where }) => where.eq('archived', false) },
		update: {
			where: ({ where, userId }) =>
				where.is('assignee', (user) => user.eq('id', userId)),
		},
	},
	hooks: {
		beforeUpdate: ({ item }) => {
			if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},
	},
})
```

### N — un seul `define`, règles en méthodes qui utilisent `this`

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
	access: {
		read() {
			return this.where.eq('archived', false)
		},
		update() {
			return this.where.is('assignee', (user) => user.eq('id', this.userId))
		},
	},
	hooks: {
		beforeUpdate() {
			if (this.item.isDeleted)
				throw new TypeError('Deleted todos are read-only')
		},
	},
})
```

## Famille « classes actuelles » (base issue de `App.Schema(...)`)

### E1 — options annotées

```ts
// app.ts, une fois par application :
export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>

export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true }),
	archived: field.boolean({ default: false }),
	assignee: field.pointer({ target: () => TodoUser }),
})).softDelete() {
	static readonly options: Options<typeof Todo> = {
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where, userId }) =>
					where.is('assignee', (user) => user.eq('id', userId)),
			},
		},
		hooks: {
			beforeUpdate: ({ item }) => {
				if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
			},
		},
	}
}
```

### E2 — `this.with()` dans le corps

```ts
export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true }),
	archived: field.boolean({ default: false }),
	assignee: field.pointer({ target: () => TodoUser }),
})).softDelete() {
	static options = this.with({
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where, userId }) =>
					where.is('assignee', (user) => user.eq('id', userId)),
			},
		},
		hooks: {
			beforeUpdate: ({ item }) => {
				if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
			},
		},
	})
}
```

### E3 — bloc statique, une méthode par plugin

```ts
export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true }),
	archived: field.boolean({ default: false }),
	assignee: field.pointer({ target: () => TodoUser }),
})).softDelete() {
	static {
		this.access({
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where, userId }) =>
					where.is('assignee', (user) => user.eq('id', userId)),
			},
		})
		this.hooks({
			beforeUpdate: ({ item }) => {
				if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
			},
		})
	}
}
```

## Famille « classes repensées » (en-tête = données, corps = règles)

### G — en-tête et corps

```ts
// app.ts : export const { field } = App

export class Todo extends App.Schema(
	'Todo',
	{
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer(() => TodoUser),
	},
	{ softDelete: true },
) {
	static access = this.access({
		read: { where: (todo) => todo.eq('archived', false) },
		update: {
			where: (todo, { userId }) =>
				todo.is('assignee', (user) => user.eq('id', userId)),
		},
	})

	static hooks = this.hooks({
		beforeUpdate: ({ item }) => {
			if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},
	})
}
```

### G′ — G avec `Self`, à la Effect Schema

```ts
export class Todo extends App.Schema<Todo>()(
	'Todo',
	{
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer(() => TodoUser),
	},
	{ softDelete: true },
) {
	static access = this.access({
		read: { where: (todo) => todo.eq('archived', false) },
		update: {
			where: (todo, { userId }) =>
				todo.is('assignee', (user) => user.eq('id', userId)),
		},
	})

	static hooks = this.hooks({
		beforeUpdate: ({ item }) => {
			if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},
	})
}
```

## Famille « règles séparées »

### K — constante de règles + liste à l'enregistrement

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
})

export const todoRules = Todo.rules({
	access: {
		read: { where: ({ where }) => where.eq('archived', false) },
		update: {
			where: ({ where, userId }) =>
				where.is('assignee', (user) => user.eq('id', userId)),
		},
	},
	hooks: {
		beforeUpdate: ({ item }) => {
			if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},
	},
})

// ultimabase.ts
export const ultimabase = new App({
	schemas: [Todo, TodoUser],
	rules: [todoRules, todoUserRules],
})
```

### K′ — instructions sur le schéma, scellé à l'enregistrement

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
})

Todo.access({
	read: { where: ({ where }) => where.eq('archived', false) },
	update: {
		where: ({ where, userId }) =>
			where.is('assignee', (user) => user.eq('id', userId)),
	},
})

Todo.hooks({
	beforeUpdate: ({ item }) => {
		if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
	},
})
```

### L — règles au niveau de l'application

```ts
// schemas/todo.ts : uniquement les données
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ default: false }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
})

// ultimabase.ts : toutes les règles, typées sur l'ensemble des schémas
export const ultimabase = new App({
	schemas: [Todo, TodoUser],
	rules: {
		Todo: {
			access: {
				read: { where: ({ where }) => where.eq('archived', false) },
				update: {
					where: ({ where, userId }) =>
						where.is('assignee', (user) => user.eq('id', userId)),
				},
			},
			hooks: {
				beforeUpdate: ({ item }) => {
					if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
				},
			},
		},
		TodoUser: {/* … */},
	},
})
```

## Option transversale : relations par getter (à la Zod 4)

Testée dans D et dans G, au lieu de `target: () => TodoUser` :

```ts
fields: (field) => ({
	title: field.string({ required: true }),
	get assignee() {
		return field.pointer({ target: TodoUser })
	},
}),
```

## Micro-test seulement : M — champs en chaînes typées (à la ArkType)

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: {
		title: 'string',
		archived: 'boolean = false',
		assignee: 'TodoUser?',
	},
})
```

## Fabriques de plugin dans chaque famille

Le schéma de rôles s'écrit selon la forme testée, par exemple :

```ts
// Objet (D, A′, N, K, K′, L)
export const TodoRole = App.RoleSchema.define({ className: 'TodoRole', members: () => TodoUser, fields: (field) => ({ … }) })
// Classes (E1, E2, E3)
export class TodoRole extends App.RoleSchema('TodoRole', { members: () => TodoUser, fields: (field) => ({ … }) }) { … }
// Classes repensées (G, G′)
export class TodoRole extends App.RoleSchema('TodoRole', { description: field.string() }, { members: () => TodoUser }) { … }
```

## Écartées (preuve ou raison)

A (tout dans un `define` à callbacks : cycle prouvé), B (callbacks sans retour :
cascades d'erreurs), C (cibles en chaîne + registre : lente, erreurs
illisibles), F (chaîne de méthodes de plugin : cycle prouvé), `pipe(...)` (même
cycle que A), champs comme propriétés d'instance (descripteurs et valeurs
mélangés), décorateurs (types à écrire à la main), types déclarés à la main
(tout écrit deux fois), découverte automatique des fichiers (enregistrement
explicite conservé), transformation par le compilateur (génération déguisée).
