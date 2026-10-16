import { describe, expect, it } from 'vitest'

import { transformSource } from './transform.ts'

const convert = (source: string, features?: readonly string[]) =>
	transformSource(
		source,
		'input.ts',
		features === undefined ? {} : { features },
	)

describe('define-with codemod: shape methods', () => {
	it('moves shape methods into define as feature keys, options kept', () => {
		const { text, counts } = convert(
			"const A = App.Schema.define({ className: 'A', fields }).softDelete().acl()\n" +
				"const B = App.Schema.define({ className: 'B', fields }).softDelete({ mode: 'command' })\n",
		)
		expect(text).toBe(
			"const A = App.Schema.define({ className: 'A', fields, softDelete: true, acl: true })\n" +
				"const B = App.Schema.define({ className: 'B', fields, softDelete: { mode: 'command' } })\n",
		)
		expect(counts.shapeMethods).toBe(3)
	})

	it('moves comments with the feature and leaves region markers in place', () => {
		const { text } = convert(
			[
				'const A = App.Schema.define({',
				"\tclassName: 'A',",
				'\tfields,',
				'})',
				'\t// Hides rows instead of deleting them.',
				'\t.softDelete()',
				'\t//#region rules',
				'\t.acl()',
				'\t.with({ acl: rule })',
				'//#endregion rules',
				'',
			].join('\n'),
		)
		expect(text).toBe(
			[
				'const A = App.Schema.define({',
				"\tclassName: 'A',",
				'\tfields,',
				'\t// Hides rows instead of deleting them.',
				'\tsoftDelete: true,',
				'\tacl: true,',
				'})',
				'\t//#region rules',
				'\t.with((plugins) => plugins.acl(rule))',
				'//#endregion rules',
				'',
			].join('\n'),
		)
	})

	it('converts community shape methods it is told about, flags the others', () => {
		const source =
			"App.Schema.define({ className: 'A', fields }).archivable().with({ access })\n"
		expect(convert(source, ['archivable']).text).toBe(
			"App.Schema.define({ className: 'A', fields, archivable: true }).with((plugins) => plugins.access(access))\n",
		)
		const flagged = convert(source)
		expect(flagged.text).toBe(source)
		expect(flagged.flags.map(({ kind }) => kind)).toStrictEqual([
			'unknown-shape-method',
		])
	})
})

describe('define-with codemod: .with objects', () => {
	it('turns entries into builder calls in order, comments and regions kept', () => {
		const { text, counts } = convert(
			[
				"App.Schema.define({ className: 'A', fields }).with({",
				'\t// Who reads.',
				'\taccess: { read: true },',
				'\t//#region hooks',
				"\t'hooks': hooks,",
				'\t//#endregion hooks',
				'\trelations,',
				'})',
			].join('\n'),
		)
		expect(text).toBe(
			[
				"App.Schema.define({ className: 'A', fields }).with((plugins) =>",
				'plugins',
				'\t// Who reads.',
				'\t.access({ read: true })',
				'\t//#region hooks',
				'\t.hooks(hooks)',
				'\t//#endregion hooks',
				'\t.relations(relations))',
			].join('\n'),
		)
		expect(counts.withObjects).toBe(1)
	})

	it('keeps the comments after the last entry before the closing parenthesis', () => {
		expect(
			convert(
				"App.Schema.define({ className: 'A', fields }).with({\n\taccess,\n\t// end\n})",
			).text,
		).toBe(
			"App.Schema.define({ className: 'A', fields }).with((plugins) =>\nplugins\n.access(access)\n\t// end\n)",
		)
	})

	it('converts an empty object and leaves callbacks and unrelated calls alone', () => {
		const source = [
			"App.Schema.define({ className: 'A', fields }).with({})",
			"App.Schema.define({ className: 'B', fields }).with((plugins) => plugins.access(rule))",
			'const list = [1, 2].with(0, 3)',
		].join('\n')
		const { text, flags } = convert(source)
		expect(text.split('\n')).toStrictEqual([
			"App.Schema.define({ className: 'A', fields }).with((plugins) => plugins)",
			"App.Schema.define({ className: 'B', fields }).with((plugins) => plugins.access(rule))",
			'const list = [1, 2].with(0, 3)',
		])
		expect(flags).toStrictEqual([])
	})

	it('flags what it cannot convert without guessing, unchanged', () => {
		const source = [
			"App.Schema.define({ className: 'A', fields }).acl().with(rules)",
			"App.Schema.define({ className: 'B', fields }).with({ ...rules })",
			"App.Schema.define({ className: 'C', fields }).with({ ['access']: rule })",
			'Post.with({ access: rule })',
			"declare('D').softDelete()",
			'App.Schema.define(options).softDelete()',
		].join('\n')
		const { text, flags } = convert(source)
		expect(text).toBe(source)
		expect(flags.map(({ kind, line }) => [kind, line])).toStrictEqual([
			['non-literal-with', 1],
			['unconvertible-with-entry', 2],
			['unconvertible-with-entry', 3],
			['unrooted-with-object', 4],
			['unrooted-shape-method', 5],
			['non-literal-define', 6],
		])
	})

	it('converts a chain nested in a converted value', () => {
		const { text } = convert(
			"outer.define({ className: 'A' }).with({ hooks: make(inner.define({ className: 'B' }).with({ access })) })",
		)
		expect(text).toBe(
			"outer.define({ className: 'A' }).with((plugins) => plugins.hooks(make(inner.define({ className: 'B' }).with((plugins) => plugins.access(access)))))",
		)
	})
})

describe('define-with codemod: indexes', () => {
	it('adds .with indexes to define and drops a .with left empty', () => {
		const { text, counts } = convert(
			[
				'App.Schema.define({',
				"\tclassName: 'A',",
				'\tfields,',
				'})',
				'\t.softDelete()',
				'\t.with({',
				'\t\t// Unique among live rows.',
				"\t\tindexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],",
				'\t})',
			].join('\n'),
		)
		expect(text).toBe(
			[
				'App.Schema.define({',
				"\tclassName: 'A',",
				'\tfields,',
				'\t// Unique among live rows.',
				"\tindexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],",
				'\tsoftDelete: true,',
				'})',
			].join('\n'),
		)
		expect(counts).toStrictEqual({
			withObjects: 1,
			shapeMethods: 1,
			withIndexes: 1,
			roleOptions: 0,
		})
	})

	it('merges after the define indexes, whatever their form', () => {
		const lines = convert(
			[
				"App.Schema.define({ className: 'A', fields, indexes: [{ fields: ['a'] }] }).with({ indexes: [{ fields: ['b'] }], access })",
				"App.Schema.define({ className: 'B', fields, indexes: base }).with({ indexes: [{ fields: ['b'] }] })",
				"App.Schema.define({ className: 'C', fields, indexes }).with({ indexes: extra })",
			].join('\n'),
		).text.split('\n')
		expect(lines).toStrictEqual([
			"App.Schema.define({ className: 'A', fields, indexes: [{ fields: ['a'] }, { fields: ['b'] }] }).with((plugins) => plugins.access(access))",
			"App.Schema.define({ className: 'B', fields, indexes: [...base, { fields: ['b'] }] })",
			"App.Schema.define({ className: 'C', fields, indexes: [...indexes, ...extra] })",
		])
	})

	it('flags moved region markers for review', () => {
		const { flags } = convert(
			"App.Schema.define({ className: 'A', fields }).with({\n\t//#region index\n\tindexes: [],\n\t//#endregion index\n\taccess,\n})",
		)
		expect(flags.map(({ kind }) => kind)).toStrictEqual(['region-moved'])
	})
})

describe('define-with codemod: role options', () => {
	it('moves ensure, deletion and resolveCurrent to plugins.roles', () => {
		const lines = convert(
			[
				"App.RoleSchema.define({ className: 'Role', members: () => User, ensure: ['admin'], deletion: 'cascade' }).with({ access })",
				"App.RoleSchema.define({ className: 'Role', ensure: ['admin'] })",
				"App.RoleSchema.define({ className: 'Role', resolveCurrent }).with((plugins) => plugins.access(access))",
				"App.RoleSchema.define({ className: 'Role', members: () => User }).with({ access })",
			].join('\n'),
		).text.split('\n')
		expect(lines).toStrictEqual([
			"App.RoleSchema.define({ className: 'Role', members: () => User }).with((plugins) => plugins.roles({ ensure: ['admin'], deletion: 'cascade' }).access(access))",
			"App.RoleSchema.define({ className: 'Role' }).with((plugins) => plugins.roles({ ensure: ['admin'] }))",
			"App.RoleSchema.define({ className: 'Role' }).with((plugins) => plugins.roles({ resolveCurrent }).access(access))",
			"App.RoleSchema.define({ className: 'Role', members: () => User }).with((plugins) => plugins.access(access))",
		])
	})

	it('flags a callback that does not start from its parameter', () => {
		const source =
			"App.RoleSchema.define({ className: 'Role', ensure: ['a'] }).with((plugins) => { return plugins })"
		const { text, flags } = convert(source)
		expect(text).toBe(source)
		expect(flags.map(({ kind }) => kind)).toStrictEqual([
			'with-callback-without-plugins',
		])
	})
})
