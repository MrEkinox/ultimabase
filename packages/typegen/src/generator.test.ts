import {
	addSchemaField,
	defineOperation,
	defineOperationValue,
	defineQueryExtension,
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	defineSchemaOption,
	defineTypegenReference,
	FrameworkApplication,
	QueryBuilder,
	replaceSchemaCompiler,
	Schema,
	stringField,
	type FieldBuilder,
	type SchemaOptions,
} from '@ultimabase/core'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import { describe, expect, it } from 'vitest'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

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
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.typegen-setup-guard',
		setup: () => {
			setupCalls += 1
		},
	})
	const Author = Schema.define({
		className: 'TypegenAuthor',
		fields: (field) => ({
			name: field.string({ validation: { required: true } }),
			articles: field.relation({ target: 'TypegenArticle' }),
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
				matrix: field.int({ list: true }),
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
					target: 'TypegenAuthor',
					validation: { required: true },
				}),
				related: field.relation({
					target: 'TypegenArticle',
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
	it('uses the same replaced logical graph as the JavaScript application', () => {
		const Target = Schema.define({
			className: 'ReplacedTypegenTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const replacement = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.typegen-schema-compiler',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares an ignored patch fixture.',
				},
				{
					name: 'schema:replace',
					reason: 'Selects the complete fixture compiler.',
				},
			] as const,
			version: '1.0.0',
			capabilities: {
				replaces: [
					replaceSchemaCompiler({
						compile: (input) =>
							immutableRecord({
								protocolVersion: input.protocolVersion,
								selections: immutableArray(
									input.declarations.flatMap(({ selections }) =>
										selections.map(({ selectionId }) =>
											immutableRecord({
												classNames: immutableArray([]),
												selectionId,
											}),
										),
									),
								),
								schemas: immutableArray(input.schemas),
							}),
						contributionId: 'typegen-fixture-compiler',
					}),
				],
			},
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'canonical-only',
							field: stringField(),
							name: 'canonicalOnly',
						}),
					],
					targets: schemas.select({ className: Target.className }),
				})
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement],
			schemas: [Target],
		})
		const generated = generateApplicationTypes({
			application,
			applicationId: 'fixture.replaced-graph',
		})

		expect(Target.fields).not.toHaveProperty('canonicalOnly')
		expect(
			generated.snapshot.schemas[0]?.fields.map(({ name }) => name),
		).not.toContain('canonicalOnly')
		expect(application.schemaCompilerProvenance.contributionId).toBe(
			'typegen-fixture-compiler',
		)
	})

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
		expect(first.contents).not.toMatch(/^export type \w+(?:Access|Hooks) =/mu)
		expect(first.contents).not.toContain('Core.GeneratedOrderBy')
		expect(first.contents).toContain(
			'export type OrderDirection = "asc" | "desc"',
		)
		expect(first.contents).toContain(
			'export type TypegenArticleOrderByInput = {',
		)
		const schemaRegistry = first.contents.slice(
			first.contents.indexOf('export declare namespace Schemas'),
			first.contents.indexOf('// Framework registry'),
		)

		expect(schemaRegistry).toContain('export type TypegenArticle = {')
		expect(schemaRegistry).toContain('readonly item: TypegenArticleItem')
		expect(schemaRegistry).not.toContain('export type Item =')
		expect(schemaRegistry).not.toContain('export type TypeInfo =')
		expect(schemaRegistry).not.toContain('readonly access:')
		expect(schemaRegistry).not.toContain('readonly hooks:')
		expect(first.contents).not.toContain('GeneratedFieldContract')
		expect(first.contents).not.toContain('Metadata')
		expect(first.contents).toContain(
			'readonly "TypegenArticle": Schemas.TypegenArticle',
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
				.map(({ typegen, name, value }) => ({
					typegen,
					name,
					value:
						value.kind === 'object'
							? { kind: value.kind, typeName: value.typeName }
							: value,
				})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "name": "author",
			    "typegen": {
			      "create": "required",
			      "list": false,
			      "nullable": false,
			      "object": "required",
			      "update": "optional",
			    },
			    "value": {
			      "kind": "pointer",
			      "target": "TypegenAuthor",
			    },
			  },
			  {
			    "name": "billingAddress",
			    "typegen": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "value": {
			      "kind": "object",
			      "typeName": "PostalAddress",
			    },
			  },
			  {
			    "name": "embedding",
			    "typegen": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "value": {
			      "kind": "plugin",
			      "reference": {
			        "exportName": "VectorValue",
			        "module": "@ultimabase/pg-vector-plugin",
			      },
			    },
			  },
			  {
			    "name": "matrix",
			    "typegen": {
			      "create": "optional",
			      "list": true,
			      "nullable": true,
			      "object": "required",
			      "update": "optional",
			    },
			    "value": {
			      "kind": "number",
			    },
			  },
			  {
			    "name": "slug",
			    "typegen": {
			      "create": "optional",
			      "list": false,
			      "nullable": true,
			      "object": "required",
			      "update": "forbidden",
			    },
			    "value": {
			      "kind": "string",
			    },
			  },
			  {
			    "name": "status",
			    "typegen": {
			      "create": "required",
			      "list": false,
			      "nullable": false,
			      "object": "required",
			      "update": "optional",
			    },
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
			'readonly matrix: ReadonlyArray<number> | null',
		)
		expect(generated.contents).toContain('export type ArrayIntFilter = {')
		expect(generated.contents).toContain('readonly matrix?: ArrayIntFilter')
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
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first-shared-plugin',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares the first shared FieldBuilder method.',
				},
			],
			declare: ({ fields }) => {
				fields.register(firstMethod)
			},
		})
		const secondPlugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second-shared-plugin',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares the second shared FieldBuilder method.',
				},
			],
			declare: ({ fields }) => {
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

	it('renders exact operations, handles, options, and structured types reproducibly', () => {
		const inputReference = defineTypegenReference({
			exportName: 'PublishInput',
			module: '@fixture/workflow-plugin',
		})
		const resultReference = defineTypegenReference({
			exportName: 'PublishResult',
			module: '@fixture/workflow-plugin',
		})
		const handleReference = defineTypegenReference({
			exportName: 'ApplicationOperationHandle',
			module: '@ultimabase/core',
		})
		const workflowName = 'Editorial' as const
		const publish = defineOperation({
			input: defineOperationValue(
				(value) => immutableRecord({ value }),
				inputReference,
			),
			name: 'fixture.workflow.publish',
			result: defineOperationValue(
				(value) => immutableRecord({ value }),
				resultReference,
			),
			target: 'schema',
			transaction: 'required',
			version: '2.3.0',
		})
		const byWorkflow = defineQueryExtension({
			apply: (schema, workflow) =>
				new QueryBuilder(schema).where({ workflow: { eq: workflow } }),
			input: defineOperationValue((value, path) => {
				if (typeof value !== 'string')
					throw new TypeError(`${path} must be a string`)
				return value
			}, inputReference),
			name: 'fixture.workflow.by-name',
			version: '1.0.0',
		})
		const workflowOption = defineSchemaOption({
			normalize: (value, path) => {
				if (typeof value !== 'string')
					throw new TypeError(`${path} must be a string`)
				return value
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/workflow-plugin',
				type: 'WorkflowName',
			},
		})
		const Post = Schema.define({
			className: 'TypegenWorkflowPost',
			fields: (field) => ({ title: field.string() }),
			workflow: 'editorial',
		} as SchemaOptions<'TypegenWorkflowPost'> & { readonly workflow: string })
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.workflow-typegen',
			version: '4.2.0',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares the workflow option.' },
				{ name: 'operation:declare', reason: 'Declares publish.' },
				{ name: 'model:extend', reason: 'Adds the publish command.' },
				{ name: 'query:extend', reason: 'Adds the workflow query.' },
				{
					name: 'typegen:reference',
					reason: 'References public workflow types.',
				},
				{
					name: 'typegen:contribute',
					reason: 'Adds correlated workflow types.',
				},
			],
			declare: ({
				models,
				operations,
				queries,
				schemas,
				typegenContributions,
				typegenReferences,
			}) => {
				typegenReferences.register(inputReference)
				typegenReferences.register(resultReference)
				typegenReferences.register(handleReference)
				schemas.defineOptions({
					contributionId: 'workflow-options',
					schema: { workflow: workflowOption },
				})
				operations.declare(publish)
				models.extend(Post, {
					contributionId: 'workflow-model',
					schemaCommands: { publish },
					staticOptions: { workflow: 'editorial' },
				})
				queries.extend(Post, {
					contributionId: 'workflow-query',
					extensions: { byWorkflow },
				})
				typegenContributions.add({
					contributionId: 'workflow-types',
					augmentations: [
						{
							schema: [
								{
									name: 'publish',
									type: {
										kind: 'reference',
										reference: handleReference,
									},
								},
							],
							target: Post.className,
						},
					],
					declarations: [
						{
							kind: 'type',
							name: `Configured${workflowName}Workflow`,
							type: {
								kind: 'object',
								properties: [
									{
										name: 'publish',
										type: {
											kind: 'tuple',
											values: [
												{ kind: 'reference', reference: inputReference },
												{ kind: 'reference', reference: resultReference },
											],
										},
									},
								],
							},
						},
					],
					staticOptions: { workflow: 'editorial' },
				})
			},
		})
		const application = new FrameworkApplication({
			plugins: [plugin],
			schemas: [Post],
		})

		const first = generateApplicationTypes({
			application,
			applicationId: 'fixture.workflow',
		})
		const second = generateApplicationTypes({
			application,
			applicationId: 'fixture.workflow',
		})

		expect(second).toStrictEqual(first)
		expect(first.snapshot.version).toBe(2)
		expect(first.contents).toContain('export type ConfiguredEditorialWorkflow')
		expect(first.contents).toContain('interface UltimaBaseGeneratedOperations')
		expect(first.contents).toContain('readonly "fixture.workflow.publish"')
		expect(first.contents).toContain(
			'interface UltimaBaseGeneratedSchemaSurfaces',
		)
		expect(first.contents).toContain(
			'readonly publish: "fixture.workflow.publish"',
		)
		expect(first.contents).toMatch(/readonly schema: \{\s+readonly publish:/u)
		expect(first.contents).toContain(
			'readonly byWorkflow: Core.QueryExtensionDefinition',
		)
		expect(first.contents).toContain(
			'interface UltimaBaseGeneratedSchemaOptions',
		)
		expect(first.contents).toContain('readonly workflow?:')
	})
})
