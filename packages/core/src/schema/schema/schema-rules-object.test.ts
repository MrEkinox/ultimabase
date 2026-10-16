import { describe, expect, expectTypeOf, it } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { readSchemaRulesObject } from './schema-rules-object.js'

// spike/with-object: `.with({ … })` accepts the rule names declared when the
// factory was configured (no Proxy), plus Core's `relations`.
describe('the .with rules object', () => {
	const names = ['relations', 'access', 'audit']

	it('copies each rule as an entry, in order, without undefined entries', () => {
		const rules = readSchemaRulesObject(
			{ audit: true, access: { read: true }, relations: undefined },
			names,
			'Post',
		)

		expect(rules).toStrictEqual({ audit: true, access: { read: true } })
		expect(Object.keys(rules)).toStrictEqual(['audit', 'access'])
	})

	it('names the available rules for a key no installed plugin declares', () => {
		expect(() => readSchemaRulesObject({ hooks: {} }, names, 'Post')).toThrow(
			new TypeError(
				'Post.with({ hooks }): hooks is not a rule of an installed plugin; .with accepts relations, access, audit',
			),
		)
		expect(() =>
			readSchemaRulesObject({ [Symbol('rule')]: {} }, names, 'Post'),
		).toThrow(/^Post\.with\(\{ Symbol\(rule\) \}\)/u)
	})

	it('keeps a __proto__ key as an unknown rule, never as a prototype', () => {
		const input: unknown = JSON.parse('{"__proto__": {"access": true}}')

		expect(() => readSchemaRulesObject(input as object, names, 'Post')).toThrow(
			/^Post\.with\(\{ __proto__ \}\)/u,
		)
	})

	it('ends a root declaration with Core relation rules only', () => {
		const Author = UltimaBase.Schema.define({
			className: 'ObjectAuthor',
			fields: (field) => ({
				name: field.string(),
				posts: field.relation({ target: 'ObjectPost', mappedBy: 'author' }),
			}),
		}).with({ relations: { posts: { where: { title: { eq: 'Published' } } } } })

		expect(Reflect.has(Author, 'with')).toBe(false)
		expectTypeOf(Author).not.toHaveProperty('with')
		const NoAccess = UltimaBase.Schema.define({
			className: 'ObjectNoAccess',
			fields: (field) => ({ name: field.string() }),
		})
		expect(() =>
			// @ts-expect-error -- no installed plugin declares access
			NoAccess.with({ access: { read: true } }),
		).toThrow('ObjectNoAccess.with({ access }): access is not a rule')
	})
})
