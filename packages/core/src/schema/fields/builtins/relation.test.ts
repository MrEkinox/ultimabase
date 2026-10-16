import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../../application/framework-application.js'
import { plugin as createPlugin } from '../../../plugins/plugin.js'
import { contributeApplication } from '../../../plugins/plugin-contributions.js'
import { getCompiledStaticRelationWhere } from '../../../query/filters/relation-where-declaration.js'
import { UltimaBase } from '../../../runtime/application/ultima-base.js'
import {
	compileValidationPlans,
	relationField,
	SchemaRegistry,
	snapshotScalarFieldValue,
	type SchemaDefinition,
} from '../../index.js'
import {
	RelationArticle,
	RelationAuthor,
	RelationPost,
	RelationTag,
} from '../../../../tests/fixtures/relation-fixture.js'
import { getRelationWhereDeclaration } from '../base/definition.js'

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
		expect(RelationArticle.fields.tags?.options).not.toHaveProperty('target')
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
		const tags = RelationArticle.fields.tags
		if (tags === undefined) {
			throw new TypeError('Expected the tags relation field to be compiled')
		}
		expect(() => snapshotScalarFieldValue(tags, [], 'input.tags')).toThrow(
			new TypeError(
				'input.tags is a relation handle and cannot contain an embedded value',
			),
		)
	})

	it('copies portable documentation metadata', () => {
		const field = relationField({
			description: 'Tags attached to an article',
			target: () => RelationTag,
		})

		expect(field.options).toStrictEqual({
			description: 'Tags attached to an article',
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('snapshots static where input of .with without exposing it as field metadata', () => {
		const where = { id: { eq: 'initial' } }
		const Source = UltimaBase.Schema.define({
			className: 'SnapshotRelationWhereSource',
			fields: (field) => ({
				tags: field.relation({ target: () => RelationTag }),
			}),
		}).with((plugins) => plugins.relations({ tags: { where } }))
		where.id.eq = 'mutated'
		const tags = Source.persistedFields.tags
		if (tags === undefined) throw new TypeError('Expected tags relation field')
		const declaration = getRelationWhereDeclaration(tags)

		expect(tags.options).toStrictEqual({})
		expect(declaration).toStrictEqual({
			input: { id: { eq: 'initial' } },
			kind: 'static',
		})
		expect(
			Object.isFrozen(
				declaration?.kind === 'static' ? declaration.input : undefined,
			),
		).toBe(true)
	})

	it('retains contextual resolvers of .with privately', () => {
		const resolver = () => ({ id: { eq: 'visible' } })
		const Source = UltimaBase.Schema.define({
			className: 'ContextualRelationWhereSource',
			fields: (field) => ({
				tags: field.relation({ target: () => RelationTag }),
			}),
		}).with((plugins) => plugins.relations({ tags: { where: resolver } }))
		const tags = Source.persistedFields.tags
		if (tags === undefined) throw new TypeError('Expected tags relation field')
		const declaration = getRelationWhereDeclaration(tags)

		expect(tags.options).toStrictEqual({})
		expect(declaration).toMatchObject({ kind: 'contextual' })
		expect(declaration?.kind === 'contextual' && declaration.resolve).toBe(
			resolver,
		)
	})

	it('normalizes static filters only after the exact target resolves', () => {
		const Target = UltimaBase.Schema.define({
			className: 'RelationWhereTarget',
			fields: (field) => ({ active: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'RelationWhereSource',
			fields: (field) => ({
				targets: field.relation({ target: 'RelationWhereTarget' }),
			}),
		}).with((plugins) =>
			plugins.relations({ targets: { where: { active: { eq: true } } } }),
		)
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [Source, Target],
		}).compileSchemas()
		const relation = Source.persistedFields.targets

		if (relation === undefined) throw new TypeError('Expected relation field')
		expect(application.schemaTargets.get(Source, ['targets'])).toBe(Target)
		expect(getCompiledStaticRelationWhere(relation)).toStrictEqual({
			field: 'active',
			kind: 'equal',
			value: true,
		})
	})

	it('rejects invalid static target filters during application compilation', () => {
		const Target = UltimaBase.Schema.define({
			className: 'InvalidRelationWhereTarget',
			fields: (field) => ({ active: field.boolean() }),
		})
		const unknownField = UltimaBase.Schema.define({
			className: 'UnknownRelationWhereSource',
			fields: (field) => ({
				targets: field.relation({ target: 'InvalidRelationWhereTarget' }),
			}),
		}).with((plugins) =>
			plugins.relations({ targets: { where: { missing: { eq: true } } } }),
		)
		const invalidOperator = UltimaBase.Schema.define({
			className: 'OperatorRelationWhereSource',
			fields: (field) => ({
				targets: field.relation({ target: 'InvalidRelationWhereTarget' }),
			}),
		}).with((plugins) =>
			plugins.relations({ targets: { where: { active: { contains: true } } } }),
		)

		expect(() =>
			new FrameworkApplication({
				plugins: [],
				schemas: [unknownField, Target],
			}).compileSchemas(),
		).toThrow('where.missing must reference a schema field')
		expect(() =>
			new FrameworkApplication({
				plugins: [],
				schemas: [invalidOperator, Target],
			}).compileSchemas(),
		).toThrow('query operator contains does not support boolean fields')
	})

	it.each([
		['default', { default: [], target: () => RelationTag }],
		['immutable', { immutable: true, target: () => RelationTag }],
		['indexed', { indexed: true, target: () => RelationTag }],
		['list', { list: true, target: () => RelationTag }],
		['required', { required: true, target: () => RelationTag }],
		// Relation filters are declared in `plugins.relations(…)` (ADR-0328).
		['where', { target: () => RelationTag, where: {} }],
	])('rejects unsupported %s metadata', (key, options) => {
		expect(() => {
			relationField(options as never)
		}).toThrow(new TypeError(`Unknown relation field option: ${key}`))
	})

	it('rejects missing and incompatible inverse mappings', () => {
		const Target = UltimaBase.Schema.define({
			className: 'InvalidRelationTarget',
			fields: (field) => ({ scalar: field.string() }),
		})
		const MissingSource = UltimaBase.Schema.define({
			className: 'MissingRelationSource',
			fields: (field) => ({
				inverse: field.relation({
					target: 'InvalidRelationTarget',
					mappedBy: 'missing',
				}),
			}),
		})
		const IncompatibleSource = UltimaBase.Schema.define({
			className: 'IncompatibleRelationSource',
			fields: (field) => ({
				inverse: field.relation({
					target: 'InvalidRelationTarget',
					mappedBy: 'scalar',
				}),
			}),
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

	it('reports inherited Object.prototype mappings as missing fields', () => {
		const Target = UltimaBase.Schema.define({
			className: 'InheritedMappingRelationTarget',
			fields: (field) => ({ scalar: field.string() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'InheritedMappingRelationSource',
			fields: (field) => ({
				inverse: field.relation({
					target: 'InheritedMappingRelationTarget',
					mappedBy: 'toString',
				}),
			}),
		})

		expect(() =>
			new SchemaRegistry([Source, Target]).resolveSchemaTargets(),
		).toThrow(
			expect.objectContaining({
				code: 'SCHEMA_RELATION_MAPPING_FAILED',
				mappedBy: 'toString',
				reason: 'missing-mapped-field',
			}),
		)
	})

	it('rejects wrong targets and inverse-to-inverse cycles', () => {
		const ExpectedSource = UltimaBase.Schema.define({
			className: 'ExpectedRelationSource',
			fields: () => ({}),
		})
		const OtherSource = UltimaBase.Schema.define({
			className: 'OtherRelationSource',
			fields: () => ({}),
		})
		const PointerTarget = UltimaBase.Schema.define({
			className: 'WrongRelationPointerTarget',
			fields: (field) => ({
				owner: field.pointer({ target: 'OtherRelationSource' }),
			}),
		})
		const WrongSource = UltimaBase.Schema.define({
			className: 'WrongRelationSource',
			fields: (field) => ({
				inverse: field.relation({
					target: 'WrongRelationPointerTarget',
					mappedBy: 'owner',
				}),
			}),
		})

		expect(() =>
			new SchemaRegistry([
				ExpectedSource,
				OtherSource,
				PointerTarget,
				WrongSource,
			]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'incompatible-mapping' }))

		const Left: SchemaDefinition = UltimaBase.Schema.define({
			className: 'InverseCycleLeft',
			fields: (field) => ({
				left: field.relation({
					target: 'InverseCycleRight',
					mappedBy: 'right',
				}),
			}),
		})
		const Right: SchemaDefinition = UltimaBase.Schema.define({
			className: 'InverseCycleRight',
			fields: (field) => ({
				right: field.relation({
					target: 'InverseCycleLeft',
					mappedBy: 'left',
				}),
			}),
		})

		expect(() =>
			new SchemaRegistry([Left, Right]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'self-conflicting-mapping' }))
	})

	it('rejects ambiguous inverses and multiply owned field reuse', () => {
		const owningField = relationField({ target: () => Inverse })
		const Owner: SchemaDefinition = UltimaBase.Schema.define({
			className: 'AmbiguousRelationOwner',
			fields: () => ({ targets: owningField }),
		})
		const Inverse = UltimaBase.Schema.define({
			className: 'AmbiguousRelationInverse',
			fields: (field) => ({
				first: field.relation({
					target: 'AmbiguousRelationOwner',
					mappedBy: 'targets',
				}),
				second: field.relation({
					target: 'AmbiguousRelationOwner',
					mappedBy: 'targets',
				}),
			}),
		})

		expect(() =>
			new SchemaRegistry([Owner, Inverse]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'ambiguous-mapping' }))

		const ReusedTarget = UltimaBase.Schema.define({
			className: 'ReusedRelationTarget',
			fields: () => ({}),
		})
		const reusedField = relationField({ target: () => ReusedTarget })
		const ReusedSource = UltimaBase.Schema.define({
			className: 'ReusedRelationOwner',
			fields: () => ({ first: reusedField, second: reusedField }),
		})

		expect(() =>
			new SchemaRegistry([ReusedSource, ReusedTarget]).resolveSchemaTargets(),
		).toThrow(expect.objectContaining({ reason: 'multiply-owned-mapping' }))
	})

	it('rejects invalid topology before infrastructure connects', async () => {
		const events: string[] = []
		const Target = UltimaBase.Schema.define({
			className: 'RelationLifecycleTarget',
			fields: (field) => ({ scalar: field.string() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'RelationLifecycleSource',
			fields: (field) => ({
				inverse: field.relation({
					target: 'RelationLifecycleTarget',
					mappedBy: 'scalar',
				}),
			}),
		})
		const infrastructure = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.relation-infrastructure',
			contributions: [
				contributeApplication((context) => {
					events.push('setup')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(() => {
								events.push('connect')
							})()
						},
					}
				}),
			],
		})
		const application = new FrameworkApplication({
			plugins: [infrastructure],
			schemas: [Source, Target],
		})

		await expect(application.start()).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: { code: 'SCHEMA_RELATION_MAPPING_FAILED' },
		})
		expect(events).toStrictEqual([])
	})
})
