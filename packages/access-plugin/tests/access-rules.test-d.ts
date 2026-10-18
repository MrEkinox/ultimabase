import { UltimaBase, dateTimeField, isAuthenticated } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { expectTypeOf, test } from 'vitest'

import {
	accessPlugin,
	type AllowWithoutRule,
	type SchemaAccess,
} from '../src/index.js'

// ADR-0317: one rule per operation, detailed mutations, read granularity,
// plugin command and permission keys, partial field rules, openings.
const archivePlugin = definePlugin({
	name: '@fixture/archive',
	features: {
		archivable: feature({
			fields: { archivedAt: dateTimeField() },
			commands: {
				archiveOne: command({
					authority: 'request',
					effect: 'update',
					data: () => ({ archivedAt: '2026-10-18T00:00:00.000Z' }),
				}),
				purgeOne: command({ authority: 'master', effect: 'delete' }),
			},
			permissions: ['readArchived'],
		}),
	},
})
const App = UltimaBase.use(accessPlugin(), archivePlugin)

test('accepts true, false and filters, and rejects a rule that may return nothing', () => {
	App.Schema.define({
		className: 'RuleFormsPost',
		fields: (field) => ({
			author: field.string(),
			published: field.boolean(),
		}),
	}).with({
		access: {
			read: ({ where }) => where.eq('published', true),
			create: isAuthenticated,
			update: ({ principal, where }) =>
				principal === undefined ? false : where.eq('author', principal.id),
			upsert: false,
			delete: () => ({ published: false }),
		},
	})
	App.Schema.define({
		className: 'RuleFormsNothing',
		fields: (field) => ({ published: field.boolean() }),
	}).with({
		access: {
			// @ts-expect-error -- A rule always decides: no `undefined` result.
			read: ({ principal, where }) => {
				if (principal !== undefined) return where.eq('published', true)
			},
		},
	})
	App.Schema.define({
		className: 'RuleFormsCreateFilter',
		fields: (field) => ({ published: field.boolean() }),
	}).with({
		access: {
			// @ts-expect-error -- Nothing is loaded before a create: no filter.
			create: () => ({ published: true }),
		},
	})
})

test('types the detailed { where, item } form of mutations', () => {
	App.Schema.define({
		className: 'RuleFormsDetailed',
		fields: (field) => ({ author: field.string(), title: field.string() }),
	}).with({
		access: {
			update: {
				where: ({ principal }) => principal !== undefined,
				item: ({ item, originalItem, principal }) =>
					originalItem.author === principal?.id &&
					item.author === originalItem.author,
			},
			create: { where: true, item: ({ item }) => item.title !== '' },
			delete: {
				where: true,
				item: ({ originalItem }) => originalItem.title !== '',
			},
		},
	})
	App.Schema.define({
		className: 'RuleFormsDetailedMissing',
		fields: (field) => ({ title: field.string() }),
	}).with({
		access: {
			// @ts-expect-error -- The detailed form needs both `where` and `item`.
			update: { item: () => true },
		},
	})
})

test('rules each read operation on its own, members optional', () => {
	App.Schema.define({
		className: 'RuleFormsReads',
		fields: (field) => ({ published: field.boolean() }),
	}).with({
		access: {
			read: true,
			findMany: ({ where }) => where.eq('published', true),
			count: true,
		},
	})
	App.Schema.define({
		className: 'RuleFormsReadsGrouped',
		fields: (field) => ({ published: field.boolean() }),
	}).with({
		// @ts-expect-error -- The grouped read form is replaced by findOne and findMany (ADR-0347).
		access: { read: { many: true } },
	})
})

test('takes groups and operations but never a write method (ADR-0347)', () => {
	App.Schema.define({
		className: 'RuleFormsGroups',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({
		access: {
			all: false,
			read: true,
			write: isAuthenticated,
			create: { where: true, item: ({ item }) => item.title !== '' },
			archive: false,
		},
	})
	App.Schema.define({
		className: 'RuleFormsCreateMany',
		fields: (field) => ({ title: field.string() }),
	}).with({
		// @ts-expect-error -- A write rule never depends on cardinality: use `create`.
		access: { createMany: true },
	})
	App.Schema.define({
		className: 'RuleFormsArchiveOne',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({
		// @ts-expect-error -- A plugin command is ruled by its operation: use `archive`.
		access: { archiveOne: true },
	})
	App.Schema.define({
		className: 'RuleFormsDetailedGroup',
		fields: (field) => ({ title: field.string() }),
	}).with({
		access: {
			// @ts-expect-error -- A group takes the short form only.
			write: { where: true, item: () => true },
		},
	})
})

test('adds plugin command and permission keys only where the feature is set', () => {
	App.Schema.define({
		className: 'RuleFormsArchived',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({
		access: {
			archive: {
				where: true,
				item: ({ originalItem }) => originalItem.title !== '',
			},
			readArchived: isAuthenticated,
		},
	})
	App.Schema.define({
		className: 'RuleFormsArchivedPurge',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({
		// @ts-expect-error -- Master-only commands have no Access rule.
		access: { purge: true },
	})
	App.Schema.define({
		className: 'RuleFormsArchivedPermissionFilter',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({
		access: {
			// @ts-expect-error -- A permission is granted or not: no filter.
			readArchived: () => ({ title: 'x' }),
		},
	})
	const Plain = App.Schema.define({
		className: 'RuleFormsPlain',
		fields: (field) => ({ title: field.string() }),
	}).with({
		// @ts-expect-error -- Without `archivable` there is no `readArchived`.
		access: { readArchived: true },
	})
	void Plain
	expectTypeOf<keyof SchemaAccess<typeof Plain>>().toEqualTypeOf<
		| 'all'
		| 'read'
		| 'write'
		| 'find'
		| 'findOne'
		| 'findMany'
		| 'count'
		| 'exists'
		| 'create'
		| 'update'
		| 'upsert'
		| 'delete'
	>()
})

test('accepts partial field rules', () => {
	App.Schema.define({
		className: 'RuleFormsFields',
		fields: (field) => ({
			email: field.string({ access: { read: { where: false } } }),
			role: field.string({ access: { write: { clear: false } } }),
		}),
	})
})

test('types every allowWithoutRule value', () => {
	expectTypeOf<{
		all: 'development'
		read: true
		count: false
		write: typeof isAuthenticated
		findOne: true
		findMany: false
		softDelete: true
	}>().toExtend<AllowWithoutRule>()
	accessPlugin({ allowWithoutRule: { all: true, write: false } })
	// @ts-expect-error -- A write rule never depends on cardinality: use `create`.
	accessPlugin({ allowWithoutRule: { createMany: true } })
	// @ts-expect-error -- Only true, false, 'development' or a predicate.
	accessPlugin({ allowWithoutRule: { read: 'production' } })
	// @ts-expect-error -- `default` is replaced by `allowWithoutRule` (ADR-0317).
	accessPlugin({ default: true })
})
