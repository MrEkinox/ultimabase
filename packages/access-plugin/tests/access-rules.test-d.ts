import { UltimaBase, isAuthenticated } from '@ultimabase/core'
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
			commands: {
				archiveOne: command({ authority: 'request', effect: 'update' }),
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
	}).with((plugins) =>
		plugins.access({
			read: ({ where }) => where.eq('published', true),
			create: isAuthenticated,
			update: ({ principal, where }) =>
				principal === undefined ? false : where.eq('author', principal.id),
			upsert: false,
			delete: () => ({ published: false }),
		}),
	)
	App.Schema.define({
		className: 'RuleFormsNothing',
		fields: (field) => ({ published: field.boolean() }),
	}).with((plugins) =>
		plugins.access({
			// @ts-expect-error -- A rule always decides: no `undefined` result.
			read: ({ principal, where }) => {
				if (principal !== undefined) return where.eq('published', true)
			},
		}),
	)
	App.Schema.define({
		className: 'RuleFormsCreateFilter',
		fields: (field) => ({ published: field.boolean() }),
	}).with((plugins) =>
		plugins.access({
			// @ts-expect-error -- Nothing is loaded before a create: no filter.
			create: () => ({ published: true }),
		}),
	)
})

test('types the detailed { where, item } form of mutations', () => {
	App.Schema.define({
		className: 'RuleFormsDetailed',
		fields: (field) => ({ author: field.string(), title: field.string() }),
	}).with((plugins) =>
		plugins.access({
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
		}),
	)
	App.Schema.define({
		className: 'RuleFormsDetailedMissing',
		fields: (field) => ({ title: field.string() }),
	}).with((plugins) =>
		plugins.access({
			// @ts-expect-error -- The detailed form needs both `where` and `item`.
			update: { item: () => true },
		}),
	)
})

test('rules each read operation on its own, members optional', () => {
	App.Schema.define({
		className: 'RuleFormsReads',
		fields: (field) => ({ published: field.boolean() }),
	}).with((plugins) =>
		plugins.access({
			read: { many: ({ where }) => where.eq('published', true), count: true },
		}),
	)
	App.Schema.define({
		className: 'RuleFormsReadsTypo',
		fields: (field) => ({ published: field.boolean() }),
	}).with((plugins) =>
		plugins
			// @ts-expect-error -- `all` is an allowWithoutRule key, not a read operation.
			.access({ read: { all: true } }),
	)
})

test('adds plugin command and permission keys only where the shape method is called', () => {
	App.Schema.define({
		className: 'RuleFormsArchived',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with((plugins) =>
		plugins.access({
			archiveOne: {
				where: true,
				item: ({ originalItem }) => originalItem.title !== '',
			},
			readArchived: isAuthenticated,
		}),
	)
	App.Schema.define({
		className: 'RuleFormsArchivedPurge',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with((plugins) =>
		plugins
			// @ts-expect-error -- Master-only commands have no Access rule.
			.access({ purgeOne: true }),
	)
	App.Schema.define({
		className: 'RuleFormsArchivedPermissionFilter',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with((plugins) =>
		plugins.access({
			// @ts-expect-error -- A permission is granted or not: no filter.
			readArchived: () => ({ title: 'x' }),
		}),
	)
	const Plain = App.Schema.define({
		className: 'RuleFormsPlain',
		fields: (field) => ({ title: field.string() }),
	}).with((plugins) =>
		plugins
			// @ts-expect-error -- Without `.archivable()` there is no `readArchived`.
			.access({ readArchived: true }),
	)
	void Plain
	expectTypeOf<keyof SchemaAccess<typeof Plain>>().toEqualTypeOf<
		'read' | 'create' | 'update' | 'upsert' | 'delete'
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
		softDeleteOne: true
	}>().toExtend<AllowWithoutRule>()
	accessPlugin({ allowWithoutRule: { all: true, write: false } })
	// @ts-expect-error -- Only true, false, 'development' or a predicate.
	accessPlugin({ allowWithoutRule: { read: 'production' } })
	// @ts-expect-error -- `default` is replaced by `allowWithoutRule` (ADR-0317).
	accessPlugin({ default: true })
})
