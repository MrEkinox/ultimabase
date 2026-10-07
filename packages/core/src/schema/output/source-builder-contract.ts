import type {
	ConfigurePluginSourceFactory,
	PluginSourceContextSurface,
	PluginSourceState,
	ResolvePluginFieldSourceOptions,
} from '../../plugins/source-projections.js'
import type {
	GenericOutputDescriptor,
	OutputBuilder,
	OutputValue,
} from './contracts.js'

type SourceOutputFactoryValue<TResult> = TResult extends GenericOutputDescriptor
	? OutputValue<TResult>
	: never

type ConfiguredPluginOutputFactory<
	TSource extends PluginSourceState,
	TFactory,
> = TFactory extends (...arguments_: infer _TArguments) => infer TResult
	? ConfigurePluginSourceFactory<
			TFactory,
			ResolvePluginFieldSourceOptions<
				TSource,
				'output',
				SourceOutputFactoryValue<TResult>
			>
		>
	: TFactory

type ConfiguredPluginOutputMethods<TSource extends PluginSourceState> =
	Readonly<{
		[
			TName in keyof PluginSourceContextSurface<
				TSource,
				'output',
				'fieldBuilders'
			>
		]: ConfiguredPluginOutputFactory<
			TSource,
			PluginSourceContextSurface<TSource, 'output', 'fieldBuilders'>[TName]
		>
	}>

/** Builds one recursive output surface from installed source receipts. */
export type ConfiguredOutputBuilder<TSource extends PluginSourceState> =
	OutputBuilder<
		PluginSourceContextSurface<TSource, 'output', 'fieldOptions'>,
		ConfiguredPluginOutputMethods<TSource>
	>
