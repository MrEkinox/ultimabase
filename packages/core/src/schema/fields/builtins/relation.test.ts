import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../../application/framework-application.js'
import { definePlugin } from '../../../plugins/definition.js'
import {
	compileValidationPlans,
	pointerField,
	relationField,
	Schema,
	SchemaRegistry,
	snapshotScalarFieldValue,
	stringField,
	type SchemaDefinition,
} from '../../index.js'
import {
	RelationArticle,
	RelationAuthor,
	RelationPost,
	RelationTag,
} from './relation-fixture.test-support.js'

describe('relationField', () => {
	it('keeps targets private and compiles owning and inverse metadata', () => {
		const graph = new SchemaRegistry([
			RelationAuthor,
			RelationPost,
			RelationArticle,
			RelationTag,
		]).resolveSchemaTargets()

		expect(RelationArticle.fields.tags).toStrictEqual({
			kind: 'relation',
			options: {},
		})
		expect(RelationAuthor.fields.posts).toStrictEqual({
			kind: 'relation',
			options: { mappedBy: 'author' },
		})
		expect(RelationArticle.fields.tags.options).not.toHaveProperty('target')
		expect(graph.getRelation(RelationArticle, ['tags'])).toStrictEqual({
			fieldPath: ['tags'],
			ownership: 'owning',
			source: RelationArticle,
			target: RelationTag,
		})
		expect(graph.getRelation(RelationAuthor, ['posts'])).toStrictEqual({
			fieldPath: ['posts'],
			mappedBy: {
				fieldPath: ['author'],
				kind: 'pointer',
				schema: RelationPost,
			},
			ownership: 'inverse',
			source: RelationAuthor,
			target: RelationPost,
		})
		expect(
			graph.getRelation(RelationTag, ['articles'])?.mappedBy,
		).toMatchObject({
			fieldPath: ['tags'],
			kind: 'relation',
			schema: RelationArticle,
		})
		expect(Object.isFrozen(graph.relations())).toBe(true)
		expect(Object.isFrozen(graph.relations()[0])).toBe(true)
	})

	it('omits collections from validation inputs and rejects direct values', () => {
		const plans = compileValidationPlans(RelationArticle)

		expect(plans.create.fields.tags).toMatchObject({
			field: RelationArticle.fields.tags,
			presence: 'forbidden',
		})
		expect(plans.update.fields.tags?.presence).toBe('forbidden')
		expect(() =>
			snapshotScalarFieldValue(RelationArticle.fields.tags, [], 'input.tags'),
		).toThrow(
			new TypeError(
				'input.tags is a relation handle and cannot contain an embedded value',
			),
		)
	})

	it('copies portable documentation and extension metadata', () => {
		const extension = Object.freeze({
			config: Object.freeze({ enabled: true }),
			name: 'relation-audit',
			pluginName: 'fixture.relation-audit',
			scope: 'field' as const,
		})
		const field = relationField({
			description: 'Tags attached to an article',
			extensions: [extension],
			target: () => RelationTag,
		})

		expect(field.options).toStrictEqual({
			description: 'Tags attached to an article',
			extensions: [extension],
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.extensions)).toBe(true)
	})

	it.each([
		['default', { default: [], target: () => RelationTag }],
		['immutable', { immutable: true, target: () => RelationTag }],
		['indexed', { indexed: true, target: () => RelationTag }],
		['list', { list: true, target: () => RelationTag }],
		['validation', { target: () => RelationTag, validation: {} }],
	])('rejects unsupported %s metadata', (key, options) => {
		expect(() => {
			relationField(options)
		}).toThrow(new TypeError(`relationField does not support ${key}`))
	})

	it('rejects missing and incompatible inverse mappings', () => {
		const Target = Schema.define({
			className: 'InvalidRelationTarget',
			fields: { scalar: stringField() },
		})
		const MissingSource = Schema.define({
			className: 'MissingRelationSource',
			fields: {
				inverse: relationField({
					target: () => Target,
					// @ts-expect-error -- Runtime resolution protects JavaScript declarations.
					mappedBy: 'missing',
				}),
			},
		})
		const IncompatibleSource = Schema.define({
			className: 'IncompatibleRelationSource',
			fields: {
				inverse: relationField({
					target: () => Target,
					// @ts-expect-error -- Runtime resolution rejects scalar mappings.
					mappedBy: 'scalar',
				}),
			},
		})

		expect(() =>
			new SchemaRegistry([MissingSource, Target]).resolveSchemaTargets(),
		).toThrow(
			expect.objectContaining({
				code: 'SCHEMA_RELATION_MAPPING_FAILED',
				fieldPath: ['inverse'],
				mappedBy: 'missing',
				reason: 'missing-mapped-field',
			}),
		)
		expect(() =>
			new SchemaRegistry([IncompatibleSource, Target]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'incompatible-mapping' }))
	})

	it('rejects wrong targets and inverse-to-inverse cycles', () => {
		const ExpectedSource = Schema.define({
			className: 'ExpectedRelationSource',
			fields: {},
		})
		const OtherSource = Schema.define({
			className: 'OtherRelationSource',
			fields: {},
		})
		const PointerTarget = Schema.define({
			className: 'WrongRelationPointerTarget',
			fields: { owner: pointerField({ target: () => OtherSource }) },
		})
		const WrongSource = Schema.define({
			className: 'WrongRelationSource',
			fields: {
				inverse: relationField({
					target: () => PointerTarget,
					mappedBy: 'owner',
				}),
			},
		})

		expect(() =>
			new SchemaRegistry([
				ExpectedSource,
				OtherSource,
				PointerTarget,
				WrongSource,
			]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'incompatible-mapping' }))

		const Left: SchemaDefinition = Schema.define({
			className: 'InverseCycleLeft',
			fields: {
				left: relationField({
					target: () => Right,
					// @ts-expect-error -- Runtime rejects inverse-to-inverse cycles.
					mappedBy: 'right',
				}),
			},
		})
		const Right: SchemaDefinition = Schema.define({
			className: 'InverseCycleRight',
			fields: {
				right: relationField({
					target: () => Left,
					// @ts-expect-error -- Runtime rejects inverse-to-inverse cycles.
					mappedBy: 'left',
				}),
			},
		})

		expect(() =>
			new SchemaRegistry([Left, Right]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'self-conflicting-mapping' }))
	})

	it('rejects ambiguous inverses and multiply owned field reuse', () => {
		const owningField = relationField({ target: () => Inverse })
		const Owner: SchemaDefinition = Schema.define({
			className: 'AmbiguousRelationOwner',
			fields: { targets: owningField },
		})
		const Inverse = Schema.define({
			className: 'AmbiguousRelationInverse',
			fields: {
				first: relationField({
					target: () => Owner,
					// @ts-expect-error -- Generic runtime fixture bypasses exact mappedBy inference.
					mappedBy: 'targets',
				}),
				second: relationField({
					target: () => Owner,
					// @ts-expect-error -- The graph rejects a second inverse for one owner.
					mappedBy: 'targets',
				}),
			},
		})

		expect(() =>
			new SchemaRegistry([Owner, Inverse]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'ambiguous-mapping' }))

		const ReusedTarget = Schema.define({
			className: 'ReusedRelationTarget',
			fields: {},
		})
		const reusedField = relationField({ target: () => ReusedTarget })
		const ReusedSource = Schema.define({
			className: 'ReusedRelationOwner',
			fields: { first: reusedField, second: reusedField },
		})

		expect(() =>
			new SchemaRegistry([ReusedSource, ReusedTarget]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'multiply-owned-mapping' }))
	})

	it('rejects invalid topology before infrastructure connects', async () => {
		const events: string[] = []
		const Target = Schema.define({
			className: 'RelationLifecycleTarget',
			fields: { scalar: stringField() },
		})
		const Source = Schema.define({
			className: 'RelationLifecycleSource',
			fields: {
				inverse: relationField({
					target: () => Target,
					// @ts-expect-error -- Runtime setup rejects incompatible mappings.
					mappedBy: 'scalar',
				}),
			},
		})
		const infrastructure = definePlugin({
			name: 'fixture.relation-infrastructure',
			setup: () => {
				events.push('setup')
			},
			hooks: {
				connect: () => {
					events.push('connect')
				},
			},
		})
		const application = new FrameworkApplication({
			plugins: [infrastructure],
			schemas: [Source, Target],
		})

		await expect(application.start()).rejects.toMatchObject({
			code: 'SCHEMA_RELATION_MAPPING_FAILED',
		})
		expect(events).toStrictEqual([])
	})
})
