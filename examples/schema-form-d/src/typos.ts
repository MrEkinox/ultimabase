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

// Misuses of relation filters (ADR-0328), each reported on its line too.

/** 9. Relation filter on an unknown relation name. */
export const TypoRelationName = App.Schema.define({
	className: 'TypoRelationName',
	fields: (field) => ({
		label: field.string(),
		todos: field.relation({ target: () => Todo }),
	}),
}).with({
	relations: {
		// @ts-expect-error -- `todoz` is not a relation (did you mean `todos`?).
		todoz: { where: { archived: { eq: false } } },
	},
})

/** 10. Relation filter on a field that is not a relation. */
export const TypoRelationField = App.Schema.define({
	className: 'TypoRelationField',
	fields: (field) => ({
		label: field.string(),
		todos: field.relation({ target: () => Todo }),
	}),
}).with({
	relations: {
		// @ts-expect-error -- `label` is not a relation.
		label: { where: {} },
	},
})

/** 11. Target field typo in a static filter; 12. in a resolver. */
export const TypoRelationWhere = App.Schema.define({
	className: 'TypoRelationWhere',
	fields: (field) => ({
		openTodos: field.relation({ target: () => Todo }),
		titledTodos: field.relation({ target: () => Todo }),
	}),
}).with({
	relations: {
		// @ts-expect-error -- `archivd` is not a field of Todo.
		openTodos: { where: { archivd: { eq: false } } },
		// @ts-expect-error -- `titel` is not a field of Todo.
		titledTodos: { where: ({ where }) => where.ne('titel', '') },
	},
})

/** 13. Relation filters on a schema without relation fields. */
export const TypoRelationless = App.Schema.define({
	className: 'TypoRelationless',
	fields: (field) => ({ title: field.string() }),
}).with({
	// @ts-expect-error -- TypoRelationless declares no relation field.
	relations: {},
})
