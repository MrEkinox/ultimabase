import type { MaybePromise } from '@ultimabase/shared'

import type {
	PluginSourceFieldObjectValue,
	PluginSourceOpaque,
} from '@ultimabase/core'

import type { HookContext } from '../context/hook-context.js'
import type { HookHandlerDeclaration } from './contracts.js'

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

type SourceFieldHandler<TInput> = (
	input: TInput,
) => MaybePromise<PluginSourceFieldObjectValue | undefined>

/** Derives field Hooks from exact scalar, list, and nullability metadata. */
export interface SourceFieldHooksOption {
	readonly resolveInput?:
		| HookHandlerDeclaration<SourceFieldHandler<SourceFieldAllInput>>
		| Readonly<{
				all?: HookHandlerDeclaration<SourceFieldHandler<SourceFieldAllInput>>
				create?: HookHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'create', 'create'>>
				>
				update?: HookHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'update', 'update'>>
				>
				upsert?: HookHandlerDeclaration<
					SourceFieldHandler<SourceFieldInput<'upsert', 'create' | 'update'>>
				>
		  }>
}
