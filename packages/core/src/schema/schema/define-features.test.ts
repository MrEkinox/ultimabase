import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	addSchemaField,
	contributeDeclarations,
	defineSchemaOption,
	plugin as createPlugin,
	provideSchemaFeatures,
	provideSchemaRules,
	readSchemaRules,
	type PluginInstance,
	type PluginSchemaFeatureSource,
	type PluginSchemaFieldsSource,
	type PluginSchemaRulesSource,
	type SchemaFeature,
	type SchemaFieldsHKT,
	type SchemaRulesHKT,
} from '../../plugin.js'
import { createQueryAst } from '../../query/ast/factory.js'
import { normalizeUniqueUpsertTarget } from '../../query/operations/upsert.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { stringField } from '../fields/builtins/string.js'
import type { SchemaDefinition } from './definition.js'

// ADR-0339: features are keys of `define`; rules are the methods of
// `.with({ … })`. The fixture's `flagged` feature adds `flagCode`
// and requires its `audit` rule.
interface AuditRules extends SchemaRulesHKT {
	readonly rules: Readonly<{ audit?: boolean }>
}

const flagCode = stringField()

interface FlagFields extends SchemaFieldsHKT {
	readonly fields: 'flagged' extends keyof this['shape']
		? Readonly<{ flagCode: typeof flagCode }>
		: unknown
}

type FlagSource =
	| PluginSchemaFieldsSource<FlagFields>
	| PluginSchemaFeatureSource<{
			readonly flagged: SchemaFeature<
				readonly [],
				Readonly<{ flagged: object }>,
				'audit'
			>
	  }>
	| PluginSchemaRulesSource<AuditRules>

type FlagPlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.define-features'
	readonly source: FlagSource
	readonly version: '1.0.0'
}>

const flagPlugin = (): FlagPlugin => {
	const instance: FlagPlugin = createPlugin({
		core: '^0.0.0',
		id: 'fixture.define-features',
		permissions: { 'schema:declare': 'Declares the flag fixture.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'options',
						schema: {
							flagged: defineSchemaOption({
								normalize: (value: unknown) => value,
								protocolVersion: 1,
								valueKind: 'opaque',
							}),
							audit: defineSchemaOption({
								normalize: (value: unknown, path: string) => {
									if (typeof value !== 'boolean') {
										throw new TypeError(`${path} must be a boolean`)
									}
									return value
								},
								protocolVersion: 1,
							}),
						},
					})
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'flag-code',
								field: flagCode,
								name: 'flagCode',
							}),
						],
						targets: schemas.select({ option: { name: 'flagged' } }),
					})
					return undefined
				},
			}),
		],
	})
	return provideSchemaRules<FlagPlugin>(
		provideSchemaFeatures<FlagPlugin>(instance, {
			flagged: {
				sets: ['flagged'],
				apply: () => ({ flagged: {} }),
				requires: ['audit'],
			},
		}),
		['audit'],
	)
}

const App = UltimaBase.use(flagPlugin())

/** Builds one equality target, as untyped transports do. */
const targetOn = (
	schema: SchemaDefinition,
	values: Readonly<Record<string, string>>,
) => {
	const expressions = Object.entries(values).map(([field, value]) =>
		immutableRecord({ kind: 'equal' as const, field, value }),
	)
	const [first] = expressions
	return immutableRecord({
		...createQueryAst(schema),
		where: immutableRecord({
			kind: 'where' as const,
			expression:
				expressions.length === 1 && first !== undefined
					? first
					: immutableRecord({
							kind: 'and' as const,
							expressions: immutableArray(expressions),
						}),
		}),
	})
}

describe('feature keys of define (ADR-0339)', () => {
	it('applies a feature set in define, never as a schema member', () => {
		const declared = App.Schema.define({
			className: 'FeatureFlagged',
			fields: (field) => ({ title: field.string() }),
			flagged: true,
		})
		const Flagged = declared.with({ audit: true })
		const compiled = new App({ logger: false, schemas: [Flagged] }).compile()
		const schema = compiled.schemas.get('FeatureFlagged')

		expect(Reflect.has(declared, 'flagged')).toBe(false)
		expect(schema?.persistedFields).toHaveProperty('flagCode')
		expect(
			schema === undefined
				? undefined
				: readSchemaRules(schema, { pluginId: 'fixture.define-features' }),
		).toEqual({ audit: true, flagged: {} })
	})

	it('takes true or an options object and keeps the unknown-key message', () => {
		expect(() => {
			Reflect.apply(App.Schema.define, App.Schema, [
				{ className: 'FeatureBadValue', fields: () => ({}), flagged: 'yes' },
			])
		}).toThrow(
			new TypeError('define() feature flagged takes true or an options object'),
		)
		expect(() => {
			Reflect.apply(App.Schema.define, App.Schema, [
				{ className: 'FeatureUnknownKey', fields: () => ({}), flaged: true },
			])
		}).toThrow(
			'Unknown schema option: flaged. define() takes className, fields and indexes; plugin rules go in the final .with(...)',
		)
	})

	it('requires the rules of a feature, in .with and when .with is missing', () => {
		const message =
			'FeatureMissingRule sets flagged in define(), which requires .with({ audit: … })'
		const declared = App.Schema.define({
			className: 'FeatureMissingRule',
			fields: (field) => ({ title: field.string() }),
			flagged: true,
		})

		const withMethod: unknown = Reflect.get(declared, 'with')
		expect(() => {
			if (typeof withMethod === 'function') {
				Reflect.apply(withMethod, declared, [{}])
			}
		}).toThrow(new TypeError(message))
		// The application reports it with its other declaration errors.
		expect(() =>
			new App({ logger: false, schemas: [declared] as never }).compile(),
		).toThrow(message)
	})

	it('checks indexes naming feature fields once the application compiles', () => {
		const Indexed = App.Schema.define({
			className: 'FeatureIndexed',
			fields: (field) => ({ title: field.string() }),
			flagged: true,
			indexes: [
				{ fields: ['flagCode'], unique: true },
				{ fields: ['title'], unique: true, where: { flagCode: 'a' } },
			],
		}).with({ audit: false })
		new App({ logger: false, schemas: [Indexed] }).compile()

		// A complete unique index of define is a unique target, even on a
		// feature field; a partial one only enforces uniqueness.
		expect(
			normalizeUniqueUpsertTarget(Indexed, targetOn(Indexed, { flagCode: 'x' }))
				.fields,
		).toEqual(['flagCode'])
		expect(() =>
			normalizeUniqueUpsertTarget(Indexed, targetOn(Indexed, { title: 'x' })),
		).toThrow(
			'upsert target must match id, a unique field or one non-partial unique index of define',
		)

		// Without the feature, an unknown index field still fails in define;
		// with it, the compiled fields decide.
		const Unknown = App.Schema.define({
			className: 'FeatureUnknownIndex',
			fields: (field) => ({ title: field.string() }),
			flagged: true,
			// @ts-expect-error -- neither declared nor added by `flagged`.
			indexes: [{ fields: ['missing'] }],
		}).with({ audit: false })
		expect(() =>
			new App({ logger: false, schemas: [Unknown] }).compile(),
		).toThrow('Unknown index field: FeatureUnknownIndex.missing')
		// So is a partial index's `where` (formerly `.with` indexes, ADR-0303).
		const UnknownWhere = App.Schema.define({
			className: 'FeatureUnknownWhere',
			fields: (field) => ({ slug: field.string() }),
			flagged: true,
			// @ts-expect-error -- `isPublished` is neither declared nor contributed.
			indexes: [{ fields: ['slug'], where: { isPublished: true } }],
		}).with({ audit: false })
		expect(() =>
			new App({ logger: false, schemas: [UnknownWhere] }).compile(),
		).toThrow('Unknown index field: isPublished')
	})
})

describe('reserved keys (ADR-0339)', () => {
	const fixture = (id: string) =>
		createPlugin({ core: '^0.0.0', id, version: '1.0.0', contributions: [] })

	it('rejects a feature or rule named after a Core key at UltimaBase.use', () => {
		const feature = provideSchemaFeatures(fixture('fixture.reserved-feature'), {
			indexes: { sets: ['indexes'], apply: () => ({}) },
		} as never)
		const rule = provideSchemaRules(fixture('fixture.reserved-rule'), [
			'with',
		] as never)

		expect(() => UltimaBase.use(feature)).toThrow(
			new TypeError(
				'A plugin cannot declare the schema feature indexes: className, fields, indexes, relations, expose and with are reserved by Core',
			),
		)
		expect(() => UltimaBase.use(rule)).toThrow(
			new TypeError(
				'A plugin cannot declare the schema rule with: className, fields, indexes, relations, expose and with are reserved by Core',
			),
		)
	})
})
