import {
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	FrameworkApplication,
	Schema,
	type FieldBuilder,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import { describe, expect, it } from 'vitest'

import type { SchemaTypegenError } from './errors.js'
import { generateApplicationTypes } from './generator.js'

type FixtureFieldBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const fixtureFieldBuilder = (field: FieldBuilder): FixtureFieldBuilder =>
	field as FixtureFieldBuilder

const createFixture = (reverseOrder = false) => {
	let setupCalls = 0
	const setupGuard = definePlugin({
		name: 'fixture.typegen-setup-guard',
		setup: () => {
			setupCalls += 1
		},
	})
	const Author = Schema.define({
		className: 'TypegenAuthor',
		fields: (field) => ({
			name: field.string({ validation: { required: true } }),
			articles: field.relation({ target: (): SchemaDefinition => Article }),
		}),
	})
	const Article = Schema.define({
		className: 'TypegenArticle',
		fields: (field) => {
			const generatedField = fixtureFieldBuilder(field)
			return {
				title: field.string({
					description: 'The public title.',
					indexed: true,
					validation: { required: true },
				}),
				slug: field.string({ default: 'draft', immutable: true }),
				matrix: field.int({ list: [true, true] }),
				status: field.enum({
					typeName: 'PublicationStatus',
					validation: { required: true },
					values: ['published', 'draft'],
				}),
				billingAddress: field.object({
					fields: (field) => ({
						city: field.string({ validation: { required: true } }),
						country: field.enum({
							typeName: 'CountryCode',
							values: ['FR', 'US'],
						}),
					}),
					typeName: 'PostalAddress',
				}),
				shippingAddress: field.object({
					fields: (field) => ({
						city: field.string({ validation: { required: true } }),
						country: field.enum({
							typeName: 'CountryCode',
							values: ['US', 'FR'],
						}),
					}),
					typeName: 'PostalAddress',
				}),
				metadata: field.json(),
				author: field.pointer({
					target: (): SchemaDefinition => Author,
					validation: { required: true },
				}),
				related: field.relation({
					target: (): SchemaDefinition => Article,
				}),
				embedding: generatedField.vector({ dimensions: 3 }),
			}
		},
		hooks: {
			beforeOperation: {
				create: () => {
					throw new TypeError('schema-hook-secret-must-not-run')
				},
			},
		},
	})
	const schemas = reverseOrder
		? ([Article, Author] as const)
		: ([Author, Article] as const)
	const plugins = reverseOrder
		? ([setupGuard, pgVectorPlugin()] as const)
		: ([pgVectorPlugin(), setupGuard] as const)
	const application = new FrameworkApplication({ plugins, schemas })

	return { application, getSetupCalls: () => setupCalls }
}

describe('generateApplicationTypes', () => {
	it('emits one deterministic callback-free registry without plugin setup', () => {
		const firstFixture = createFixture()
		const secondFixture = createFixture(true)
		const first = generateApplicationTypes({
			application: firstFixture.application,
			applicationId: 'fixture.application',
		})
		const second = generateApplicationTypes({
			application: secondFixture.application,
			applicationId: 'fixture.application',
		})

		expect(second).toStrictEqual(first)
		expect(firstFixture.getSetupCalls()).toBe(0)
		expect(secondFixture.getSetupCalls()).toBe(0)
		expect(first.contents).toContain(
			`// @ultimabase/schema-fingerprint sha256:${first.fingerprint}`,
		)
		expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
		expect(first.contents).not.toContain('schema-hook-secret-must-not-run')
		expect(first.contents).not.toContain('export type DeepPartial<TValue>')
		expect(first.contents).not.toContain('export type SchemaAccess<TItem')
		expect(first.contents).not.toContain('Core.GeneratedOrderBy')
		expect(first.contents).toContain(
			'export type OrderDirection = "asc" | "desc"',
		)
		expect(first.contents).toContain(
			'export type TypegenArticleOrderByInput = {',
		)
		const typeInfoRegistry = first.contents.slice(
			first.contents.indexOf('export declare namespace Schemas'),
			first.contents.indexOf('// Framework registry'),
		)

		expect(typeInfoRegistry).toContain('readonly item: Item')
		expect(typeInfoRegistry).not.toContain('readonly access:')
		expect(typeInfoRegistry).not.toContain('readonly hooks:')
		expect(first.contents).not.toContain('GeneratedFieldContract')
		expect(first.contents).not.toContain('Metadata')
		expect(first.contents).toContain(
			'readonly "TypegenArticle": Schemas.TypegenArticle.TypeInfo',
		)
		expect(first.contents).toContain('export type StringFilter = {')
		expect(
			first.contents.indexOf('export type TypegenArticleItem'),
		).toBeLessThan(first.contents.indexOf('export type StringFilter'))
		expect(first.contents.indexOf('export type StringFilter')).toBeLessThan(
			first.contents.indexOf('// Framework registry'),
		)
		const serializedSnapshot = JSON.stringify(first.snapshot)

		expect(serializedSnapshot).not.toContain('beforeOperation')
		expect(serializedSnapshot).not.toContain('dimensions')
		expect(serializedSnapshot).not.toContain('indexed')
		expect(serializedSnapshot).not.toContain('setup')
	})

	it('preserves exact field facts and reuses compatible named identities', () => {
		const { application } = createFixture()
		const generated = generateApplicationTypes({
			application,
			applicationId: 'fixture.application',
		})
		const article = generated.snapshot.schemas.find(
			({ className }) => className === 'TypegenArticle',
		)

		expect(
			article?.fields
				.filter(({ name }) =>
					[
						'author',
						'billingAddress',
						'embedding',
						'matrix',
						'slug',
						'status',
					].includes(name),
				)
				.map(({ inference, name, value }) => ({
					inference,
					name,
					value:
						value.kind === 'object'
							? { kind: value.kind, typeName: value.typeName }
							: value,
				})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "inference": {
			      "create": "required",
			      "list": false,
			      "nullable": false,
			      "object": "required",
			      "update": "optional",
			    },
			    "name": "author",
			    "value": {
			      "kind": "pointer",
			      "target": "TypegenAuthor",
			    },
			  },
			  {
			    "inference": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "name": "billingAddress",
			    "value": {
			      "kind": "object",
			      "typeName": "PostalAddress",
			    },
			  },
			  {
			    "inference": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "name": "embedding",
			    "value": {
			      "kind": "plugin",
			      "reference": {
			        "exportName": "VectorValue",
			        "module": "@ultimabase/pg-vector-plugin",
			      },
			    },
			  },
			  {
			    "inference": {
			      "create": "optional",
			      "list": [
			        true,
			        true,
			      ],
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "name": "matrix",
			    "value": {
			      "kind": "number",
			    },
			  },
			  {
			    "inference": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "forbidden",
			    },
			    "name": "slug",
			    "value": {
			      "kind": "string",
			    },
			  },
			  {
			    "inference": {
			      "create": "required",
			      "list": false,
			      "nullable": false,
			      "object": "required",
			      "update": "optional",
			    },
			    "name": "status",
			    "value": {
			      "kind": "enum",
			      "typeName": "PublicationStatus",
			      "values": [
			        "draft",
			        "published",
			      ],
			    },
			  },
			]
		`)

		expect(
			generated.contents.match(/export type PostalAddress =/gu),
		).toHaveLength(1)
		expect(
			generated.contents.match(/export type CountryCode =/gu),
		).toHaveLength(1)
		expect(generated.contents).toContain(
			'readonly matrix: ReadonlyArray<ReadonlyArray<number>> | null',
		)
		expect(generated.contents).toContain('readonly status: PublicationStatus')
		expect(generated.contents).toContain(
			'readonly embedding: Plugin0_VectorValue | null',
		)
		expect(generated.contents).toContain(
			'readonly author: Core.GeneratedPointerHandle<"TypegenAuthor">',
		)
		expect(generated.contents).toContain(
			'readonly related?: { readonly include?:',
		)
	})

	it('reports normalized schema and incompatible named identity collisions', () => {
		const First = Schema.define({ className: 'Typegen-A', fields: () => ({}) })
		const Second = Schema.define({ className: 'Typegen_A', fields: () => ({}) })
		const schemaCollision = new FrameworkApplication({
			plugins: [],
			schemas: [First, Second],
		})

		expect(() =>
			generateApplicationTypes({
				application: schemaCollision,
				applicationId: 'fixture.collision',
			}),
		).toThrow(
			expect.objectContaining<Partial<SchemaTypegenError>>({
				code: 'SCHEMA_TYPEGEN_FAILED',
				owner: 'schema Typegen-A',
				path: 'Typegen_AAccess',
				reason: 'generated-identity-conflict',
			}),
		)

		const Compatible = Schema.define({
			className: 'TypegenCompatibleIdentity',
			fields: (field) => ({
				first: field.object({
					fields: (field) => ({
						value: field.string(),
					}),
					typeName: 'SharedIdentity',
				}),
				second: field.object({
					fields: (field) => ({
						value: field.int(),
					}),
					typeName: 'SharedIdentity',
				}),
			}),
		})
		const identityCollision = new FrameworkApplication({
			plugins: [],
			schemas: [Compatible],
		})

		expect(() =>
			generateApplicationTypes({
				application: identityCollision,
				applicationId: 'fixture.collision',
			}),
		).toThrow(
			expect.objectContaining<Partial<SchemaTypegenError>>({
				owner: 'TypegenCompatibleIdentity.second',
				path: 'SharedIdentity',
				reason: 'generated-identity-conflict',
			}),
		)
	})

	it('rejects plugin fields without a configured typegen contribution', () => {
		const orphan = definePluginField(
			'fixture.orphan',
			{},
			{
				snapshotValue: (value: unknown) => value,
			},
		)
		const Orphan = Schema.define({
			className: 'TypegenOrphanPluginField',
			fields: () => ({
				value: orphan,
			}),
		})
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [Orphan],
		})

		expect(() =>
			generateApplicationTypes({
				application,
				applicationId: 'fixture.orphan',
			}),
		).toThrow(
			expect.objectContaining<Partial<SchemaTypegenError>>({
				path: 'TypegenOrphanPluginField.value',
				reason: 'unsupported-field-kind',
			}),
		)
	})

	it('reports conflicting plugin value contributions with their owner', () => {
		const sharedField = () =>
			definePluginField(
				'fixture.shared-kind',
				{},
				{
					snapshotValue: (value: unknown) => value,
				},
			)
		const firstMethod = defineFieldBuilderMethod({
			factory: sharedField,
			fieldKind: 'fixture.shared-kind',
			name: 'firstShared',
			typegen: {
				methodType: 'FirstSharedFieldBuilderMethod',
				module: '@fixture/first-shared-plugin',
				valueType: 'FirstSharedValue',
			},
		})
		const secondMethod = defineFieldBuilderMethod({
			factory: sharedField,
			fieldKind: 'fixture.shared-kind',
			name: 'secondShared',
			typegen: {
				methodType: 'SecondSharedFieldBuilderMethod',
				module: '@fixture/second-shared-plugin',
				valueType: 'SecondSharedValue',
			},
		})
		const firstPlugin = definePlugin({
			name: 'fixture.first-shared-plugin',
			declareFields: (fields) => {
				fields.register(firstMethod)
			},
		})
		const secondPlugin = definePlugin({
			name: 'fixture.second-shared-plugin',
			declareFields: (fields) => {
				fields.register(secondMethod)
			},
		})
		const Empty = Schema.define({
			className: 'TypegenPluginContributionConflict',
			fields: () => ({}),
		})
		const application = new FrameworkApplication({
			plugins: [firstPlugin, secondPlugin],
			schemas: [Empty],
		})

		expect(() =>
			generateApplicationTypes({
				application,
				applicationId: 'fixture.plugin-conflict',
			}),
		).toThrow(
			expect.objectContaining<Partial<SchemaTypegenError>>({
				owner: 'fixture.second-shared-plugin',
				reason: 'malformed-plugin-contribution',
			}),
		)
	})
})
