import { expectTypeOf, test } from 'vitest'

import { definePluginField } from '../schema/fields/plugin.js'
import { definePluginOutputDescriptor } from '../schema/output/descriptor.js'
import { booleanField } from '../schema/fields/builtins/boolean.js'
import type { PluginFieldDefinition } from '../schema/fields/plugin.js'
import type {
	FieldOptions,
	ScalarFieldTypeState,
} from '../schema/fields/base/contract.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { Schema } from '../schema/schema/definition.js'
import type { Model } from '../schema/schema/registered-schemas.js'
import { definePluginFieldFamily } from '../schema/schema/field-builder-methods.js'
import {
	defineFieldOption,
	defineSchemaOption,
	type SchemaOptionRuntimeRequirement,
} from './schema-option-definitions.js'
import { contributeDeclarations } from './plugin-contributions.js'
import { plugin } from './plugin.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { addSchemaField } from './schema-field-patch-operations.js'
import {
	contributeOperation,
	contributeSchemaMutation,
} from './plugin-command-contributions.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'
import type { PluginDefinition, PluginSource } from './definition.js'
import type { PluginSourceFieldValue } from './source-projections.js'
import type { ResolvePluginSchemaProjection } from './source-projections.js'
import type { SourceSchemaTypeInfo } from '../schema/schema/source-type-info.js'
import type { SchemaItem } from '../schema/schema/values.js'
import type { ConfiguredSchemaNamespace } from '../schema/schema/definition.js'

type RatingField = PluginFieldDefinition<
	'fixture.rating',
	number,
	FieldOptions<number>,
	ScalarFieldTypeState<true, false, false, false>
>

type RatingFactory = (options: { readonly required: true }) => RatingField

const rating: RatingFactory = (options) =>
	definePluginField(
		'fixture.rating',
		{ required: options.required },
		{
			snapshotValue: (value, path) => {
				if (typeof value !== 'number')
					throw new TypeError(`${path} must be numeric`)
				return value
			},
		},
	)

const ratingOutput = (options: { readonly nullable: false }) =>
	definePluginOutputDescriptor(
		'fixture.rating',
		{ list: false, nullable: options.nullable },
		(value, path): number => {
			if (typeof value !== 'number')
				throw new TypeError(`${path} must be numeric`)
			return value
		},
	)

const ratingFamily = definePluginFieldFamily({
	fieldKind: 'fixture.rating',
	typegen: {
		module: '@fixture/rating-plugin',
		valueType: 'RatingValue',
	},
	builder: {
		name: 'rating',
		contexts: {
			embedded: {
				factory: rating,
				methodType: 'RatingFieldBuilderMethod',
			},
			output: {
				factory: ratingOutput,
				methodType: 'RatingFieldBuilderMethod',
			},
			stored: {
				factory: rating,
				methodType: 'RatingFieldBuilderMethod',
			},
			virtual: {
				factory: rating,
				methodType: 'RatingFieldBuilderMethod',
			},
		},
	},
})

const workflowOption = defineSchemaOption({
	normalize: (value): Readonly<{ enabled: boolean }> => ({
		enabled: value === true,
	}),
	protocolVersion: 1,
	typegen: false,
})

const archivedField = addSchemaField({
	contributionId: 'archived-field',
	field: booleanField({ default: false, required: true }),
	mutationInput: 'forbidden',
	name: 'isArchived',
})

const stringTitleField = addSchemaField({
	contributionId: 'string-title-field',
	field: booleanField({ default: false, required: true }),
	mutationInput: 'forbidden',
	name: 'hasStringTitle',
})

const OwnedEvent = Schema.defineSpecialized(
	{
		className: 'FixtureOwnedEvent',
		fields: (field) => ({ event: field.string({ required: true }) }),
	},
	() => ({ results: {}, statics: {} }),
)

const transformOption = defineFieldOption<
	Readonly<{ transform?: (value: unknown) => unknown }>,
	SchemaOptionRuntimeRequirement,
	(value: PluginSourceFieldValue) => PluginSourceFieldValue
>({
	contexts: ['embedded', 'output', 'stored', 'virtual'],
	normalize: (value) =>
		value as Readonly<{
			transform?: (value: unknown) => unknown
		}>,
	protocolVersion: 1,
	typegen: false,
})

const inspect = defineOperation({
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.source.inspect',
	result: defineOperationValue((value: unknown) => Number(value)),
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.source.archive',
	returning: 'after',
	version: '1.0.0',
})

const sourcePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.source-projection',
	permissions: {
		'model:extend': 'Adds the archive source surface.',
		'operation:declare': 'Declares the inspect operation.',
		'schema:declare': 'Declares rating fields and workflow options.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => Number(input),
			operation: inspect,
		}),
		contributeSchemaMutation({
			mutation: archive,
			resolve: () => ({ data: { isArchived: true } }),
		}),
		contributeDeclarations({
			models: ({ models }) =>
				models.extend(
					{
						className: 'SourceProjectionPost',
						owner: { kind: 'application' },
					},
					{
						contributionId: 'archive-surface',
						schemaMutations: {
							archive: {
								mutation: archive,
								surfaces: ['schema'],
							},
						},
					},
				),
			schema: ({ fields, schemas }) => {
				const options = schemas.defineOptions({
					contributionId: 'workflow-options',
					field: { transform: transformOption },
					schema: { workflow: workflowOption },
				})
				schemas.add({
					contributionId: 'owned-event',
					schema: OwnedEvent,
				})
				return [
					fields.register(ratingFamily),
					options,
					schemas.patch({
						operations: [archivedField],
						targets: schemas.select({
							option: {
								equals: true,
								name: 'workflow',
								path: ['enabled'],
							},
						}),
					}),
					schemas.patch({
						operations: [stringTitleField],
						targets: schemas.select({
							field: { kind: 'string', name: 'title' },
						}),
					}),
				]
			},
		}),
	],
})

// @ts-expect-error -- A callback cannot hide an arbitrary result behind an undefined branch.
contributeDeclarations({
	schema: ({ fields }) =>
		Math.random() > 0.5 ? fields.register(ratingFamily) : { unsupported: true },
})

const primaryOperation = defineOperation({
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.source.primary',
	result: defineOperationValue((value: unknown) => Number(value)),
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})
const analyticsOperation = defineOperation({
	input: primaryOperation.input,
	name: 'fixture.source.analytics',
	result: primaryOperation.result,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})
const primaryInstance = plugin({
	core: '^0.0.0',
	id: 'fixture.source-instance',
	instanceId: 'primary',
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => Number(input),
			operation: primaryOperation,
		}),
	],
})
const analyticsInstance = plugin({
	core: '^0.0.0',
	id: 'fixture.source-instance',
	instanceId: 'analytics',
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => Number(input),
			operation: analyticsOperation,
		}),
	],
})

const InstanceApplication = UltimaBase.use(primaryInstance, analyticsInstance)
const instanceApplication = new InstanceApplication({ schemas: [] })
expectTypeOf(
	instanceApplication.operation('fixture.source.primary').execute('1'),
).toEqualTypeOf<Promise<number>>()
expectTypeOf(
	instanceApplication.operation('fixture.source.analytics').execute('1'),
).toEqualTypeOf<Promise<number>>()

const Application = UltimaBase.use(sourcePlugin)
const dynamicPlugins: readonly PluginDefinition[] = [primaryInstance]
const MixedApplication = UltimaBase.use(sourcePlugin, ...dynamicPlugins)
const MixedPost = MixedApplication.Schema.define({
	className: 'SourceProjectionMixedPost',
	fields: (field) => ({ score: field.rating({ required: true }) }),
})
expectTypeOf<SchemaItem<typeof MixedPost>['score']>().toBeNumber()
void MixedPost
const Post = Application.Schema.define({
	className: 'SourceProjectionPost',
	fields: (field) => ({
		children: field.relation({
			target: 'SourceProjectionPost',
			transform: (value) => value,
		}),
		parent: field.pointer({
			target: 'SourceProjectionPost',
			transform: (value) => value,
		}),
		profile: field.object({
			fields: (embedded) => ({
				label: embedded.string({
					transform: (value) => value.toUpperCase(),
				}),
			}),
		}),
		score: field.rating({
			required: true,
			transform: (value) => value + 1,
		}),
		summary: field.virtual({
			output: (output) =>
				output.string({
					nullable: false,
					transform: (value) => value.trim(),
				}),
			resolve: () => 'summary',
			select: { id: true },
			transform: (value) => value.trim(),
		}),
		ratingSummary: field.virtual({
			output: (output) =>
				output.rating({
					nullable: false,
					transform: (value) => value + 1,
				}),
			resolve: () => 1,
			select: { id: true },
		}),
		title: field.string({
			required: true,
			transform: (value) => value.trim(),
		}),
	}),
}).with({
	workflow: { enabled: true },
})

const LivePost = Application.Schema.define({
	className: 'SourceProjectionLivePost',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const BooleanTitle = Application.Schema.define({
	className: 'SourceProjectionBooleanTitle',
	fields: (field) => ({ title: field.boolean({ required: true }) }),
})

test('projects exact fields, options, and operations from one static declaration', () => {
	expectTypeOf(
		ratingFamily.builder.contexts.stored.factory,
	).toExtend<RatingFactory>()
	type StoredBuilder = Extract<
		PluginSource<typeof sourcePlugin>,
		Readonly<{ fieldBuilders: object }>
	>['fieldBuilders']['stored']
	expectTypeOf<StoredBuilder['rating']>().toExtend<RatingFactory>()
	type ContextualBuilders = Extract<
		PluginSource<typeof sourcePlugin>,
		Readonly<{ fieldBuilders: object }>
	>['fieldBuilders']
	expectTypeOf<
		ContextualBuilders['embedded']['rating']
	>().toExtend<RatingFactory>()
	expectTypeOf<
		ContextualBuilders['virtual']['rating']
	>().toExtend<RatingFactory>()
	expectTypeOf<ContextualBuilders['output']['rating']>().toExtend<
		typeof ratingOutput
	>()
	expectTypeOf(Post.className).toEqualTypeOf<'SourceProjectionPost'>()
	expectTypeOf<Model<typeof Post>['score']>().toEqualTypeOf<number>()
	expectTypeOf<Model<typeof Post>['title']>().toEqualTypeOf<string>()
	expectTypeOf<SchemaItem<typeof Post>['isArchived']>().toEqualTypeOf<boolean>()
	expectTypeOf<
		SchemaItem<typeof Post>['hasStringTitle']
	>().toEqualTypeOf<boolean>()
	expectTypeOf<
		SchemaItem<typeof LivePost>['hasStringTitle']
	>().toEqualTypeOf<boolean>()
	expectTypeOf(LivePost.className).toEqualTypeOf<'SourceProjectionLivePost'>()
	expectTypeOf(
		BooleanTitle.className,
	).toEqualTypeOf<'SourceProjectionBooleanTitle'>()
	expectTypeOf(Post.archive({ id: 'post-id', input: 'reason' })).toExtend<
		Promise<object>
	>()
	// @ts-expect-error -- The option selector does not leak the patch.
	type LiveArchived = SchemaItem<typeof LivePost>['isArchived']
	void (null as unknown as LiveArchived)
	// @ts-expect-error -- The field-kind selector does not match a boolean title.
	type BooleanTitleMarker = SchemaItem<typeof BooleanTitle>['hasStringTitle']
	void (null as unknown as BooleanTitleMarker)

	const application = new Application({ schemas: [Post] })
	expectTypeOf(
		application.operation('fixture.source.inspect').execute('1'),
	).toEqualTypeOf<Promise<number>>()

	type Source = PluginSource<typeof sourcePlugin>
	type SchemaFieldSources = Extract<
		Source,
		Readonly<{ schemaFields: object }>
	>['schemaFields']
	expectTypeOf<SchemaFieldSources['selector']>().toEqualTypeOf<
		| Readonly<{
				option: Readonly<{
					equals: true
					name: 'workflow'
					path: readonly ['enabled']
				}>
		  }>
		| Readonly<{
				field: Readonly<{ kind: 'string'; name: 'title' }>
		  }>
	>()
	type PatchProjection = Extract<
		Source,
		Readonly<{
			schemaFields: Readonly<{
				selector: Readonly<{
					option: Readonly<{
						equals: true
						name: 'workflow'
						path: readonly ['enabled']
					}>
				}>
			}>
		}>
	>
	expectTypeOf<PatchProjection['schemaFields']['selector']>().toEqualTypeOf<
		Readonly<{
			option: Readonly<{
				equals: true
				name: 'workflow'
				path: readonly ['enabled']
			}>
		}>
	>()
	type ResolvedPatch = ResolvePluginSchemaProjection<
		PatchProjection['schemaFields'],
		SourceSchemaTypeInfo<
			'SourceProjectionPost',
			Readonly<Record<never, never>>
		>,
		Readonly<{ workflow: Readonly<{ enabled: true }> }>
	>
	expectTypeOf<ResolvedPatch>().toHaveProperty('isArchived')
	type ApplicationParameters =
		InstanceType<typeof Application> extends UltimaBase<
			infer TSchemas,
			infer TPlugins,
			infer TSource
		>
			? readonly [TSchemas, TPlugins, TSource]
			: never
	type ApplicationSource = ApplicationParameters[2]
	type NamespaceSource =
		typeof Application.Schema extends ConfiguredSchemaNamespace<infer TSource>
			? TSource
			: never
	expectTypeOf<NamespaceSource>().toEqualTypeOf<ApplicationSource>()
	type ResolvedApplicationPatch = ResolvePluginSchemaProjection<
		ApplicationSource['schemaFields'],
		SourceSchemaTypeInfo<
			'SourceProjectionPost',
			Readonly<Record<never, never>>
		>,
		Readonly<{ workflow: Readonly<{ enabled: true }> }>
	>
	expectTypeOf<ResolvedApplicationPatch>().toHaveProperty('isArchived')
	expectTypeOf<Source>().toExtend<
		| Readonly<{ fieldBuilders: object }>
		| Readonly<{ fieldOptions: object }>
		| Readonly<{ model: object }>
		| Readonly<{ operations: object }>
		| Readonly<{ schemaClass: object }>
		| Readonly<{ schemaFields: object }>
		| Readonly<{ schemaOptions: object }>
	>()
})

// @ts-expect-error -- An absent plugin contributes no schema option.
const CoreOnly = UltimaBase.Schema.define({
	className: 'SourceProjectionCoreOnly',
	fields: (field) => ({ title: field.string() }),
}).with({
	workflow: { enabled: true },
})

void CoreOnly
