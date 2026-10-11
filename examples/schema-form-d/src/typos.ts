// The eight typo cases of the form comparison protocol, each one reported by
// TypeScript on the faulty line (mappedBy: at registration, by design).
import { App } from './app.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { TodoUser } from './todo-user.ts'

/** 1. Relation target typo. */
export const TypoTarget = App.Schema.define({
	className: 'TypoTarget',
	fields: (field) => ({
		// @ts-expect-error -- `TodoUsr` is not declared.
		owner: field.pointer({ target: () => TodoUsr }),
	}),
})

/** 2. Local `where` field typo; 3. cross-schema field typo; 7. wrong filter return. */
export const TypoRules = App.Schema.define({
	className: 'TypoRules',
	fields: (field) => ({
		archived: field.boolean(),
		owner: field.pointer({ target: () => TodoUser }),
	}),
}).with({
	access: {
		// @ts-expect-error -- `archivd` is not a field of TypoRules.
		read: ({ where }) => where.eq('archivd', false),
		// @ts-expect-error -- `emial` is not a field of TodoUser.
		update: ({ where }) => where.is('owner', (user) => user.eq('emial', 'x')),
		// @ts-expect-error -- a rule returns true, false or a filter.
		delete: () => 42,
	},
})

/** 4. Plugin-added field typo in a hook. */
export const TypoHook = App.Schema.define({
	className: 'TypoHook',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete()
	.with({
		hooks: {
			beforeOperation: {
				update: ({ item }) => {
					// @ts-expect-error -- `isDeletd` is not a field (soft delete adds `isDeleted`).
					void item.isDeletd
				},
			},
		},
	})

/** 5. `mappedBy` typo, reported where the schema is registered. */
export const TypoMappedBy = App.Schema.define({
	className: 'TypoMappedBy',
	fields: (field) => ({
		todos: field.relation({ target: () => Todo, mappedBy: 'asignee' }),
	}),
})
export const typoApplication = new App({
	// @ts-expect-error -- TypoMappedBy.todos: mappedBy 'asignee' is not a field of Todo.
	schemas: [TypoMappedBy, Todo, TodoUser, Tag],
})

/** 6. Rules key typo. */
export const TypoRuleKey = App.Schema.define({
	className: 'TypoRuleKey',
	fields: (field) => ({ title: field.string() }),
}).with({
	// @ts-expect-error -- `acess` is not a rule key (did you mean `access`?).
	acess: { read: true },
})

/** 8. Query selection typo. */
export const typoQuery = () =>
	// @ts-expect-error -- `titel` is not a field of Todo.
	Todo.findMany({ select: { titel: true } })
