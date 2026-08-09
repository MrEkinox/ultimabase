import {
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	FrameworkApplication,
	Schema,
	type FieldBuilder,
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
		fields(field) {
			field.string('name', { validation: { required: true } })
			field.relation('articles', { target: () => Article })
		},
	})
	const Article = Schema.define({
		className: 'TypegenArticle',
		fields(field) {
			field.string('title', {
				description: 'The public title.',
				indexed: true,
				validation: { required: true },
			})
			field.string('slug', { default: 'draft', immutable: true })
			field.int('matrix', { list: [true, true] })
			field.enum('status', {
				typeName: 'PublicationStatus',
				validation: { required: true },
				values: ['published', 'draft'],
			})
			field.object('billingAddress', {
				fields(field) {
					field.string('city', { validation: { required: true } })
					field.enum('country', {
						typeName: 'CountryCode',
						values: ['FR', 'US'],
					})
				},
				typeName: 'PostalAddress',
			})
			field.object('shippingAddress', {
				fields(field) {
					field.string('city', { validation: { required: true } })
					field.enum('country', {
						typeName: 'CountryCode',
						values: ['US', 'FR'],
					})
				},
				typeName: 'PostalAddress',
			})
			field.json('metadata')
			field.pointer('author', {
				target: () => Author,
				validation: { required: true },
			})
			field.relation('related', { target: () => Article })

			fixtureFieldBuilder(field).vector('embedding', { dimensions: 3 })
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
			generated.contents.match(/export type PostalAddressObjectItem/gu),
		).toHaveLength(1)
		expect(
			generated.contents.match(/export type CountryCodeEnum/gu),
		).toHaveLength(1)
		expect(generated.contents).toContain(
			'readonly "billingAddress": GeneratedObjectContract<PostalAddressObjectItem',
		)
		expect(generated.contents).toContain(
			'readonly "shippingAddress": GeneratedObjectContract<PostalAddressObjectItem',
		)
		expect(generated.contents).toContain(
			'readonly "matrix": readonly (readonly (number)[])[] | null',
		)
		expect(generated.contents).toContain(
			'readonly "status": PublicationStatusEnum',
		)
		expect(generated.contents).toContain(
			'readonly "embedding": Plugin0_VectorValue | null',
		)
		expect(generated.contents).toContain(
			'readonly "author": GeneratedRelationshipContract<"TypegenAuthor", "one">',
		)
		expect(generated.contents).toContain(
			'readonly "related": GeneratedRelationshipContract<"TypegenArticle", "many">',
		)
	})

	it('reports normalized schema and incompatible named identity collisions', () => {
		const First = Schema.define({ className: 'Typegen-A', fields: {} })
		const Second = Schema.define({ className: 'Typegen_A', fields: {} })
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
			fields(field) {
				field.object('first', {
					fields(field) {
						field.string('value')
					},
					typeName: 'SharedIdentity',
				})
				field.object('second', {
					fields(field) {
						field.int('value')
					},
					typeName: 'SharedIdentity',
				})
			},
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
			fields(field) {
				field.add('value', orphan)
			},
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
			fields: {},
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
