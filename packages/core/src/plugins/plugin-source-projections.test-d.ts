import { expectTypeOf, test } from 'vitest'

import { definePluginField } from '../schema/fields/plugin.js'
import { definePluginOutputDescriptor } from '../schema/output/descriptor.js'
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
	type SchemaOptionRuntimeRequirement,
} from './schema-option-definitions.js'
import { contributeDeclarations } from './plugin-contributions.js'
import { plugin } from './plugin.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { contributeOperation } from './plugin-command-contributions.js'
import type { PluginDefinition, PluginSource } from './definition.js'
import type { PluginSourceFieldValue } from './source-projections.js'
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
	builder: {
		name: 'rating',
		contexts: {
			embedded: {
				factory: rating,
			},
			output: {
				factory: ratingOutput,
			},
			stored: {
				factory: rating,
			},
			virtual: {
				factory: rating,
			},
		},
	},
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
})

const inspect = defineOperation({
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.source.inspect',
	result: defineOperationValue((value: unknown) => Number(value)),
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const sourcePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.source-projection',
	permissions: {
		'operation:declare': 'Declares the inspect operation.',
		'schema:declare': 'Declares rating fields and transform options.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => Number(input),
			operation: inspect,
		}),
		contributeDeclarations({
			schema: ({ fields, schemas }) => {
				const options = schemas.defineOptions({
					contributionId: 'transform-options',
					field: { transform: transformOption },
				})
				schemas.add({
					contributionId: 'owned-event',
					schema: OwnedEvent,
				})
				return [fields.register(ratingFamily), options]
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
})

test('projects exact field builders, field options, and operations from one static declaration', () => {
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
	const application = new Application({ schemas: [Post] })
	expectTypeOf(
		application.operation('fixture.source.inspect').execute('1'),
	).toEqualTypeOf<Promise<number>>()

	type Source = PluginSource<typeof sourcePlugin>
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
	expectTypeOf<Source>().toExtend<
		| Readonly<{ fieldBuilders: object }>
		| Readonly<{ fieldOptions: object }>
		| Readonly<{ model: object }>
		| Readonly<{ operations: object }>
	>()
})

const CoreOnly = UltimaBase.Schema.define({
	className: 'SourceProjectionCoreOnly',
	fields: (field) => ({
		// @ts-expect-error -- An absent plugin contributes no field option.
		title: field.string({ transform: (value: string) => value }),
	}),
})

void CoreOnly
