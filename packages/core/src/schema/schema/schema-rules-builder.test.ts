import { describe, expect, expectTypeOf, it } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { collectSchemaRules } from './schema-rules-builder.js'

// ADR-0339: `.with((plugins) => plugins…)` records one rule per call, with
// the rule names declared when the factory was configured (no Proxy).
/** Calls one builder method by name, as JavaScript callers do. */
const call = (builder: unknown, name: string, rule: unknown): unknown => {
	const method: unknown =
		typeof builder === 'object' && builder !== null
			? Reflect.get(builder, name)
			: undefined
	if (typeof method !== 'function') throw new TypeError(`No method ${name}`)
	return Reflect.apply(method, undefined, [rule])
}

describe('the .with rules builder', () => {
	const names = ['relations', 'access', 'audit']

	it('records each called rule once, in order', () => {
		const rules = collectSchemaRules(
			(plugins) => call(call(plugins, 'audit', true), 'access', { read: true }),
			names,
			'Post',
		)

		expect(rules).toStrictEqual({ audit: true, access: { read: true } })
		expect(Object.keys(rules)).toStrictEqual(['audit', 'access'])
	})

	it('offers only the declared rule names', () => {
		const builder = collectSchemaRules(
			(plugins) => {
				expect(
					Object.keys(
						typeof plugins === 'object' && plugins !== null ? plugins : {},
					).sort(),
				).toStrictEqual(['access', 'audit', 'relations'])
				expect(Object.isFrozen(plugins)).toBe(true)
				return plugins
			},
			names,
			'Post',
		)

		expect(builder).toStrictEqual({})
	})

	it('rejects a rule set twice', () => {
		expect(() =>
			collectSchemaRules(
				(plugins) => call(call(plugins, 'audit', true), 'audit', false),
				names,
				'Post',
			),
		).toThrow(
			new TypeError(
				'.with((plugins) => …) sets each rule once: plugins.audit(…) is called twice',
			),
		)
	})

	it('rejects a callback that does not return the builder', () => {
		const message =
			'.with((plugins) => …) must return the plugins builder, such as (plugins) => plugins.access({ … })'

		expect(() => collectSchemaRules(() => undefined, names, 'Post')).toThrow(
			new TypeError(message),
		)
		expect(() =>
			collectSchemaRules(() => ({ audit: true }), names, 'Post'),
		).toThrow(new TypeError(message))
	})

	it('names the available rules when JavaScript calls a missing one', () => {
		// What a JavaScript caller writes: `plugins` has no `hooks` method.
		const missing = (plugins: unknown): unknown =>
			(plugins as { readonly hooks: () => unknown }).hooks()

		expect(() => collectSchemaRules(missing, names, 'Post')).toThrow(
			/^plugins\.hooks is not a function in Post\.with\(\(plugins\) => …\): plugins offers relations, access, audit; a rule needs the plugin that declares it$/u,
		)
	})

	it('keeps an error thrown by the callback that is not a TypeError', () => {
		const failure = new RangeError('out of range')

		expect(() =>
			collectSchemaRules(
				() => {
					throw failure
				},
				names,
				'Post',
			),
		).toThrow(failure)
	})

	it('ends a root declaration with Core relation rules only', () => {
		const Author = UltimaBase.Schema.define({
			className: 'BuilderAuthor',
			fields: (field) => ({
				name: field.string(),
				posts: field.relation({ target: 'BuilderPost', mappedBy: 'author' }),
			}),
		}).with((plugins) => {
			expectTypeOf(plugins).toHaveProperty('relations')
			expectTypeOf(plugins).not.toHaveProperty('access')
			return plugins.relations({
				posts: { where: { title: { eq: 'Published' } } },
			})
		})

		expect(Reflect.has(Author, 'with')).toBe(false)
		expectTypeOf(Author).not.toHaveProperty('with')
	})

	it('removes a called method from the builder type', () => {
		UltimaBase.Schema.define({
			className: 'BuilderOnce',
			fields: (field) => ({
				posts: field.relation({ target: 'BuilderPost', mappedBy: 'author' }),
			}),
		}).with((plugins) => {
			const once = plugins.relations({})
			expectTypeOf(once).not.toHaveProperty('relations')
			return once
		})
	})
})
