import type { MaybePromise } from '@ultimabase/shared'

import type {
	PluginSourceFieldObjectValue,
	PluginSourceOpaque,
} from '@ultimabase/core'

import type { HookContext } from '../context/hook-context.js'

type SourceHandler<TInput, TResult = void> = (
	input: TInput,
) => MaybePromise<TResult>

type SourceHandlerDeclaration<THandler> =
	THandler | readonly [THandler, ...THandler[]]

type SourceFieldInput<
	TKind extends 'create' | 'update' | 'upsert',
	TMode extends 'create' | 'update',
> = Readonly<{
	context: PluginSourceOpaque<HookContext>
	kind: TKind
	mode: TMode
	value: PluginSourceFieldObjectValue
}>

type SourceFieldAllInput =
	| SourceFieldInput<'create', 'create'>
	| SourceFieldInput<'update', 'update'>
	| SourceFieldInput<'upsert', 'create' | 'update'>

type SourceFieldHandler<TInput> = SourceHandler<
	TInput,
	PluginSourceFieldObjectValue | undefined
>

/** Derives field Hooks from exact scalar, list, and nullability metadata. */
export interface SourceFieldHooksOption {
	readonly resolveInput?:
		| SourceHandlerDeclaration<SourceFieldHandler<SourceFieldAllInput>>
		| Readonly<{
				all?: SourceHandlerDeclaration<SourceFieldHandler<SourceFieldAllInput>>
				create?: SourceHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'create', 'create'>>
				>
				update?: SourceHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'update', 'update'>>
				>
				upsert?: SourceHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'upsert', 'create' | 'update'>>
				>
		  }>
}
