import type {
	FieldTypegenStateOf,
	FieldValue,
	GenericField,
} from '../fields/base/contract.js'
import type {
	ConfigurePluginSourceFactory,
	PluginSourceContextSurface,
	PluginSourceState,
	ResolvePluginFieldSourceOptions,
	ResolvePluginRelationSourceOptions,
} from '../../plugins/source-projections.js'
import type {
	GenericOutputDescriptor,
	OutputValue,
} from '../output/contracts.js'
import type { ConfiguredOutputBuilder } from '../output/source-builder-contract.js'
import type {
	SchemaDeclarationTargetName,
	SchemaTypeInfoSource,
} from '../type-info.js'
import type {
	RelationField,
	RelationFieldOptions,
	RelationMappedFieldName,
} from '../fields/builtins/relation.js'
import type { FieldBuilder } from './field-builder-contract.js'
import type { SchemaReference } from './definition.js'

type SourceFactoryValue<TResult> = TResult extends GenericField
	? FieldValue<TResult>
	: TResult extends GenericOutputDescriptor
		? OutputValue<TResult>
		: never

type SourceFactoryObjectValue<TResult> = TResult extends GenericField
	? true extends FieldTypegenStateOf<TResult>['nullable']
		? FieldValue<TResult> | null
		: FieldValue<TResult>
	: SourceFactoryValue<TResult>

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
				SourceFactoryValue<TResult>,
				SourceFactoryObjectValue<TResult>
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

type ConfiguredNamedRelationFieldOptions<
	TSource extends PluginSourceState,
	TTargetName extends SchemaDeclarationTargetName,
	TMappedBy extends
		RelationMappedFieldName<SchemaReference<TTargetName>> | undefined,
> = Omit<
	RelationFieldOptions<SchemaReference<TTargetName>, TMappedBy>,
	| 'target'
	| keyof ResolvePluginRelationSourceOptions<
			TSource,
			SchemaReference<TTargetName>
	  >
> &
	ResolvePluginRelationSourceOptions<TSource, SchemaReference<TTargetName>> &
	Readonly<{ target: TTargetName }>

type ConfiguredNamedRelationFieldBuilderMethod<
	TSource extends PluginSourceState,
> = <
	const TTargetName extends SchemaDeclarationTargetName,
	const TMappedBy extends
		RelationMappedFieldName<SchemaReference<TTargetName>> | undefined =
		undefined,
>(
	options: ConfiguredNamedRelationFieldOptions<TSource, TTargetName, TMappedBy>,
) => RelationField<SchemaReference<TTargetName>, TMappedBy>

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
		relation: ConfiguredNamedRelationFieldBuilderMethod<TSource>
	}>
