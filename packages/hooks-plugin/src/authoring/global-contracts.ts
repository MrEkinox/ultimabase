import type { MaybePromise } from '@ultimabase/shared'

import type { HookContext } from '../context/hook-context.js'
import type { HookHandlerDeclaration, SaveHookFamily } from './contracts.js'

/** Any schema's object or data, as a global hook receives it. */
export type GlobalHookItem = Readonly<Record<string, unknown>>

interface GlobalHookInputBase {
	/** Request identity and hook capabilities. */
	readonly context: HookContext
	/** The class name of the schema the operation writes. */
	readonly schema: string
}

/** What a global `resolveInput` receives. */
export type GlobalResolveInputHookInput = GlobalHookInputBase &
	(
		| Readonly<{ kind: 'create'; data: GlobalHookItem }>
		| Readonly<{
				kind: 'update'
				changes: GlobalHookItem
				originalItem: GlobalHookItem
		  }>
		| Readonly<{
				kind: 'upsert'
				mode: 'create' | 'update'
				data: GlobalHookItem
				changes: GlobalHookItem
				originalItem: GlobalHookItem | null
		  }>
	)

/** What a global `beforeOperation` receives. */
export type GlobalBeforeOperationHookInput = GlobalHookInputBase &
	(
		| Readonly<{ kind: 'create'; item: GlobalHookItem }>
		| Readonly<{
				kind: 'update'
				item: GlobalHookItem
				originalItem: GlobalHookItem
				changes: GlobalHookItem
		  }>
		| Readonly<{
				kind: 'upsert'
				mode: 'create' | 'update'
				item: GlobalHookItem
				originalItem: GlobalHookItem | null
		  }>
		| Readonly<{ kind: 'delete'; item: null; originalItem: GlobalHookItem }>
	)

/** What a global `afterOperation` or `afterCommit` receives. */
export type GlobalAfterOperationHookInput = GlobalHookInputBase &
	(
		| Readonly<{ kind: 'create'; item: GlobalHookItem; originalItem: null }>
		| Readonly<{
				kind: 'update'
				item: GlobalHookItem
				originalItem: GlobalHookItem
				changes: GlobalHookItem
		  }>
		| Readonly<{
				kind: 'upsert'
				mode: 'create' | 'update'
				item: GlobalHookItem
				originalItem: GlobalHookItem | null
		  }>
		| Readonly<{ kind: 'delete'; item: null; originalItem: GlobalHookItem }>
	)

/**
 * What a global `all` hook receives for a plugin command (`softDeleteOne`, …):
 * `kind` is the command name (ADR-0318 amendment).
 */
export type GlobalCommandHookInput = GlobalHookInputBase &
	Readonly<{
		kind: string
		input: unknown
		item: GlobalHookItem | null
		originalItem: GlobalHookItem
		mutation: Readonly<{ name: string; effect: string }>
		target: Readonly<{ id: string }>
	}>

type GlobalHook<TInput> = (input: TInput) => MaybePromise<void>

type GlobalResolveHook<TInput> = (
	input: TInput,
) => MaybePromise<GlobalHookItem | undefined>

/** One observing phase of the global hooks, by operation. */
export interface GlobalOperationHooks<
	TInput extends { readonly kind: string },
> {
	/** Runs for every operation and plugin command, before its own branch. */
	readonly all?: HookHandlerDeclaration<
		GlobalHook<TInput | GlobalCommandHookInput>
	>
	readonly create?: HookHandlerDeclaration<
		GlobalHook<Extract<TInput, { readonly kind: 'create' }>>
	>
	readonly update?: HookHandlerDeclaration<
		GlobalHook<Extract<TInput, { readonly kind: 'update' }>>
	>
	readonly upsert?: HookHandlerDeclaration<
		GlobalHook<Extract<TInput, { readonly kind: 'upsert' }>>
	>
	readonly delete?: HookHandlerDeclaration<
		GlobalHook<Extract<TInput, { readonly kind: 'delete' }>>
	>
}

/**
 * Hooks run for every schema of the application (ADR-0318), before each
 * schema's own hooks; `schema` names the written schema.
 *
 * @example `hooksPlugin({ global: { afterCommit: { all: ({ schema, kind }) => audit(schema, kind) } } })`
 */
export interface GlobalHooks {
	/**
	 * Changes the data, changes or upsert pair of any save; return a
	 * replacement matching `kind`, or `undefined` to keep it.
	 */
	readonly resolveInput?:
		| HookHandlerDeclaration<GlobalResolveHook<GlobalResolveInputHookInput>>
		| SaveHookFamily<
				GlobalResolveHook<GlobalResolveInputHookInput>,
				GlobalResolveHook<
					Extract<GlobalResolveInputHookInput, { readonly kind: 'create' }>
				>,
				GlobalResolveHook<
					Extract<GlobalResolveInputHookInput, { readonly kind: 'update' }>
				>,
				GlobalResolveHook<
					Extract<GlobalResolveInputHookInput, { readonly kind: 'upsert' }>
				>
		  >
	/** Observes or rejects any operation before it is stored. */
	readonly beforeOperation?: GlobalOperationHooks<GlobalBeforeOperationHookInput>
	/** Observes or rejects any stored operation before the transaction commits. */
	readonly afterOperation?: GlobalOperationHooks<GlobalAfterOperationHookInput>
	/** Runs after the transaction commits, outside it; a failure is logged. */
	readonly afterCommit?: GlobalOperationHooks<GlobalAfterOperationHookInput>
}
