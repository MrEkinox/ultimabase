import type { FieldValue, GenericField } from '../fields/base/contract.js'
import type {
	ConfigurePluginSourceFactory,
	PluginSourceContextSurface,
	PluginSourceState,
	ResolvePluginFieldSourceOptions,
} from '../../plugins/source-projections.js'
import type {
	GenericOutputDescriptor,
	OutputValue,
} from '../output/contracts.js'
import type { ConfiguredOutputBuilder } from '../output/source-builder-contract.js'
import type { SchemaTypeInfoSource } from '../type-info.js'
import type { SourceNamedRelationFieldBuilderMethod } from '../fields/builtins/relation.js'
import type { FieldBuilder } from './field-builder-contract.js'

type SourceFactoryValue<TResult> = TResult extends GenericField
	? FieldValue<TResult>
	: TResult extends GenericOutputDescriptor
		? OutputValue<TResult>
		: never

type ConfiguredPluginFactory<
	TSource extends PluginSourceState,
	TContext extends 'embedded' | 'output' | 'stored' | 'virtual',
	TFactory,
> = TFactory extends (...arguments_: infer _TArguments) => infer TResult
	? ConfigurePluginSourceFactory<
			TFactory,
			ResolvePluginFieldSourceOptions<
				TSource,
				TContext,
				SourceFactoryValue<TResult>
			>
		>
	: TFactory

type ConfiguredPluginMethods<
	TSource extends PluginSourceState,
	TContext extends 'embedded' | 'output' | 'stored' | 'virtual',
> = Readonly<{
	[
		TName in keyof PluginSourceContextSurface<
			TSource,
			TContext,
			'fieldBuilders'
		>
	]: ConfiguredPluginFactory<
		TSource,
		TContext,
		PluginSourceContextSurface<TSource, TContext, 'fieldBuilders'>[TName]
	>
}>

/** Builds one application-local field surface from installed source receipts. */
export type ConfiguredFieldBuilder<
	TSource extends PluginSourceState,
	TSchema extends SchemaTypeInfoSource,
> = Omit<
	FieldBuilder<
		TSchema,
		PluginSourceContextSurface<TSource, 'stored', 'fieldOptions'>,
		PluginSourceContextSurface<TSource, 'embedded', 'fieldOptions'>,
		PluginSourceContextSurface<TSource, 'virtual', 'fieldOptions'>,
		ConfiguredPluginMethods<TSource, 'stored'>,
		ConfiguredPluginMethods<TSource, 'embedded'>,
		ConfiguredPluginMethods<TSource, 'virtual'>,
		ConfiguredOutputBuilder<TSource>
	>,
	'relation'
> &
	Readonly<{
		relation: SourceNamedRelationFieldBuilderMethod<
			PluginSourceContextSurface<TSource, 'stored', 'fieldOptions'>
		>
	}>
