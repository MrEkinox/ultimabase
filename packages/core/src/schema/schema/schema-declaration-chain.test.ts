import { describe, expect, expectTypeOf, it } from 'vitest'

import { plugin, type PluginInstance } from '../../plugins/plugin.js'
import {
	provideSchemaShapeMethods,
	type PluginSchemaShapeSource,
	type SchemaShapeMethod,
} from '../../plugins/schema-extensions.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { Schema } from './definition.js'

type MarkSource = PluginSchemaShapeSource<{
	readonly mark: SchemaShapeMethod<readonly [], Readonly<{ marked: true }>>
}>

type MarkPlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.schema-shape'
	readonly source: MarkSource
	readonly version: '1.0.0'
}>

const markPlugin = (): MarkPlugin =>
	provideSchemaShapeMethods<MarkPlugin, MarkSource>(
		plugin({
			core: '^0.0.0',
			id: 'fixture.schema-shape',
			version: '1.0.0',
			contributions: [],
		}),
		{ mark: { apply: () => ({ marked: true }), sets: ['marked'] } },
	)

describe('schema declaration chain (ADR-0297)', () => {
	it('ends with .with() on a new immutable schema without chain methods', () => {
		const declared = UltimaBase.Schema.define({
			className: 'ChainDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const configured = declared.with({})

		expect(Schema.is(declared)).toBe(true)
		expect(Schema.is(configured)).toBe(true)
		expect(configured).not.toBe(declared)
		expect(Object.isFrozen(configured)).toBe(true)
		expect(Reflect.has(configured, 'with')).toBe(false)
		expect(Object.keys(declared)).not.toContain('with')
		const withMethod: unknown = Reflect.get(declared, 'with')
		expect(() => {
			if (typeof withMethod === 'function') {
				Reflect.apply(withMethod, declared, [null])
			}
		}).toThrow('schema rules must be an object')
		expectTypeOf(configured).not.toHaveProperty('with')
	})

	it('exposes plugin shape methods once, before .with()', () => {
		const Application = UltimaBase.use(markPlugin())
		const declared = Application.Schema.define({
			className: 'ShapedDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const shaped = declared.mark()

		expect(Schema.is(shaped)).toBe(true)
		expect(Reflect.has(shaped, 'mark')).toBe(false)
		expect(Reflect.has(shaped, 'with')).toBe(true)
		expectTypeOf(shaped).not.toHaveProperty('mark')
		// The root factory installs no plugin, so no shape method exists there.
		expect(
			Reflect.has(
				UltimaBase.Schema.define({
					className: 'PlainDocument',
					fields: () => ({}),
				}),
				'mark',
			),
		).toBe(false)
		expectTypeOf(
			UltimaBase.Schema.define({
				className: 'PlainDocument',
				fields: () => ({}),
			}),
		).not.toHaveProperty('mark')
	})

	it('omits a shape method whose options the declaration already sets', () => {
		const Application = UltimaBase.use(markPlugin())
		// `marked` is not a declared option type here; the runtime rule is checked directly.
		const declared: unknown = Reflect.apply(
			Application.Schema.define,
			Application.Schema,
			[{ className: 'PreMarkedDocument', fields: () => ({}), marked: true }],
		)

		expect(Schema.is(declared)).toBe(true)
		expect(
			typeof declared === 'function' && Reflect.has(declared, 'mark'),
		).toBe(false)
	})
})
