import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import {
	contributeDeclarations,
	plugin as createPlugin,
	provideSchemaRules,
	type PluginInstance,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
} from '../plugin.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { defineWithRawRules } from '../schema/schema/raw-schema-rules.test-support.js'
import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'
import {
	normalizeExposureRule,
	readSchemaExposeRule,
} from './exposure-rules.js'

describe('exposure rule normalization (ADR-0347)', () => {
	it('keeps booleans and copies a record of boolean keys', () => {
		expect(normalizeExposureRule(true, 'Todo.expose')).toBe(true)
		expect(normalizeExposureRule(false, 'Todo.expose')).toBe(false)
		const rule = normalizeExposureRule(
			{ write: false, create: true, softDelete: true, softDeleteOne: false },
			'Todo.expose',
		)
		expect(rule).toStrictEqual({
			write: false,
			create: true,
			softDelete: true,
			softDeleteOne: false,
		})
		expect(Object.isFrozen(rule)).toBe(true)
	})

	it.each([
		[1, 'Todo.expose must be a boolean or plain object'],
		[[], 'Todo.expose must be a boolean or plain object'],
		[
			{ Find: true },
			'Todo.expose contains unknown method: Find; use all, read, write, find, count, exists, create, update, upsert, delete, findMany, findOne, createOne, createMany, updateOne, updateMany, upsertOne, upsertMany, deleteOne, deleteMany or a plugin operation or command name',
		],
		[{ count: 'yes' }, 'Todo.expose.count must be a boolean'],
	])('refuses a malformed rule %#', (value, message) => {
		expect(() => normalizeExposureRule(value, 'Todo.expose')).toThrow(
			new TypeError(message),
		)
	})

	it('refuses plugin keys in a rule that applies to every schema', () => {
		expect(() =>
			normalizeExposureRule({ softDelete: true }, 'REST plugin default', {
				pluginKeys: false,
			}),
		).toThrow(
			new TypeError(
				'REST plugin default contains unknown method: softDelete; use all, read, write, find, count, exists, create, update, upsert, delete, findMany, findOne, createOne, createMany, updateOne, updateMany, upsertOne, upsertMany, deleteOne, deleteMany',
			),
		)
	})

	it('refuses a __proto__ key instead of reading a prototype', () => {
		const input: unknown = JSON.parse('{"__proto__": true}')
		expect(() => normalizeExposureRule(input, 'Todo.expose')).toThrow(
			'Todo.expose contains unknown method: __proto__',
		)
	})
})

describe('the expose rule of .with (ADR-0347)', () => {
	it('is accepted by a factory without rule plugins and compiled as a Core key', () => {
		const Exposed = UltimaBase.Schema.define({
			className: 'ExposeRuleDocument',
			fields: (field) => ({ title: field.string() }),
		}).with({ expose: { write: false, create: true } })
		const Hidden = UltimaBase.Schema.define({
			className: 'ExposeRuleHidden',
			fields: (field) => ({ title: field.string() }),
		}).with({ expose: false })
		const Plain = UltimaBase.Schema.define({
			className: 'ExposeRulePlain',
			fields: (field) => ({ title: field.string() }),
		}).with({})

		const { schemas } = new UltimaBase({
			logger: false,
			schemas: [Exposed, Hidden, Plain],
		}).compile()
		const compiled = (className: string) => {
			const schema = schemas.get(className)
			if (schema === undefined) throw new TypeError(`${className} missing`)
			return schema
		}

		expect(readSchemaExposeRule(compiled('ExposeRuleDocument'))).toStrictEqual({
			write: false,
			create: true,
		})
		expect(readSchemaExposeRule(compiled('ExposeRuleHidden'))).toBe(false)
		expect(readSchemaExposeRule(compiled('ExposeRulePlain'))).toBeUndefined()
		expect(
			Object.keys(compiled('ExposeRuleDocument').provenance.options),
		).not.toContain('expose')
	})

	it('validates the shape when .with is called', () => {
		const declared = UltimaBase.Schema.define({
			className: 'ExposeRuleInvalid',
			fields: (field) => ({ title: field.string() }),
		})
		const withMethod: unknown = Reflect.get(declared, 'with')
		const call = (rules: unknown): unknown =>
			typeof withMethod === 'function'
				? Reflect.apply(withMethod, declared, [rules])
				: undefined

		expect(() => call({ expose: 'yes' })).toThrow(
			new TypeError(
				'ExposeRuleInvalid.expose must be a boolean or plain object',
			),
		)
		expect(() => call({ hooks: {} })).toThrow(
			new TypeError(
				'ExposeRuleInvalid.with({ hooks }): hooks is not a rule of an installed plugin; .with accepts relations, expose',
			),
		)
	})
})

interface ExposeRules extends SchemaRulesHKT {
	readonly rules: Readonly<{ expose?: boolean }>
}

type ExposeRulePlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.expose-rule'
	readonly source: PluginSchemaRulesSource<ExposeRules>
	readonly version: '1.0.0'
}>

describe('expose ownership (ADR-0347)', () => {
	it('refuses expose as a schema option, as a feature patch could set it', () => {
		expect(() =>
			defineWithRawRules(
				{ className: 'ExposeRuleOption', fields: () => ({}) },
				{ expose: true },
			),
		).toThrow(
			new TypeError(
				'Schema option expose is owned by Core: set it in the final .with({ expose })',
			),
		)
	})

	it('rejects a plugin rule named expose', () => {
		const instance: ExposeRulePlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.expose-rule',
			version: '1.0.0',
			contributions: [],
		})
		const rule = provideSchemaRules<ExposeRulePlugin>(instance, ['expose'])

		expect(() => UltimaBase.use(rule)).toThrow(
			new TypeError(
				'A plugin cannot declare the schema rule expose: className, fields, indexes, relations, expose and with are reserved by Core',
			),
		)
	})

	it('rejects a plugin schema option named expose', async () => {
		const option = createPlugin({
			core: '^0.0.0',
			id: 'fixture.expose-option',
			permissions: { 'schema:declare': 'Exercises expose ownership.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'expose',
							schema: { expose: jsonObjectOption },
						})
						return undefined
					},
				}),
			],
		})

		await expect(
			createApplication({ plugins: [option], schemas: [] }),
		).rejects.toThrow(
			'Plugin option collides with Core-owned schema option: expose',
		)
	})
})
