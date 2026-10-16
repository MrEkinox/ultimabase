import { describe, expect, expectTypeOf, it } from 'vitest'

import { plugin, type PluginInstance } from '../../plugins/plugin.js'
import {
	provideSchemaFeatures,
	type PluginSchemaFeatureSource,
	type SchemaFeature,
} from '../../plugins/schema-extensions.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { Schema } from './definition.js'
import { isConfiguredSchemaNamespace } from './schema-declaration-chain.js'

type MarkSource = PluginSchemaFeatureSource<{
	readonly mark: SchemaFeature<readonly [], Readonly<{ marked: true }>>
}>

type MarkPlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.schema-shape'
	readonly source: MarkSource
	readonly version: '1.0.0'
}>

const markPlugin = (): MarkPlugin =>
	provideSchemaFeatures<MarkPlugin, MarkSource>(
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
		// ADR-0339: `.with` takes an object of rules; a non-object
		// and a key no installed plugin declares are refused.
		const call = (rules: unknown): unknown =>
			typeof withMethod === 'function'
				? Reflect.apply(withMethod, declared, [rules])
				: undefined
		expect(Schema.is(call({}))).toBe(true)
		expect(Schema.is(call({ relations: undefined }))).toBe(true)
		expect(() => call(null)).toThrow(
			new TypeError(
				'ChainDocument.with() takes an object of rules: .with({ access: { … } })',
			),
		)
		expect(() => call({ audit: true })).toThrow(
			new TypeError(
				'ChainDocument.with({ audit }): audit is not a rule of an installed plugin; .with accepts relations',
			),
		)
		expectTypeOf(configured).not.toHaveProperty('with')
	})

	it('takes plugin features as define keys, never as schema methods', () => {
		const Application = UltimaBase.use(markPlugin())
		const plain = Application.Schema.define({
			className: 'PlainMarkDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const marked = Application.Schema.define({
			className: 'MarkedDocument',
			fields: (field) => ({ title: field.string() }),
			mark: true,
		})

		expect(Schema.is(marked)).toBe(true)
		// ADR-0339: shape methods are gone; `.with` is the only chain method.
		for (const declared of [plain, marked]) {
			expect(Reflect.has(declared, 'mark')).toBe(false)
			expect(Reflect.has(declared, 'with')).toBe(true)
		}
		expectTypeOf(plain).not.toHaveProperty('mark')
		expectTypeOf(marked).not.toHaveProperty('mark')
		// The root factory installs no plugin, so `mark` is an unknown option.
		expect(() => {
			Reflect.apply(UltimaBase.Schema.define, UltimaBase.Schema, [
				{ className: 'PlainDocument', fields: () => ({}), mark: true },
			])
		}).toThrow('Unknown schema option: mark.')
	})

	it('recognizes every factory Schema namespace and nothing else', () => {
		const Application = UltimaBase.use(markPlugin())

		// A factory with features owns its namespace; plugin schema factories accept both.
		expect(Application.Schema).not.toBe(UltimaBase.Schema)
		expect(isConfiguredSchemaNamespace(UltimaBase.Schema)).toBe(true)
		expect(isConfiguredSchemaNamespace(Application.Schema)).toBe(true)
		expect(isConfiguredSchemaNamespace({ ...Application.Schema })).toBe(false)
		expect(isConfiguredSchemaNamespace(Schema)).toBe(false)
		expect(isConfiguredSchemaNamespace(null)).toBe(false)
	})

	it('rejects plugin options passed to define itself', () => {
		const Application = UltimaBase.use(markPlugin())
		// `marked` is not a declared option type here; the runtime rule is checked directly.
		expect(() => {
			Reflect.apply(Application.Schema.define, Application.Schema, [
				{ className: 'PreMarkedDocument', fields: () => ({}), marked: true },
			])
		}).toThrow(
			'Unknown schema option: marked. define() takes className, fields and indexes; plugin rules go in the final .with(...) (ADR-0297)',
		)
	})
})
