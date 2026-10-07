import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import {
	assertOperationIdentity,
	assertOperationValueContract,
	snapshotOperationErrors,
} from './operation-contract-validation.js'
import {
	isTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'

/** Names the application identity carried by one custom operation declaration. */
export type PluginOperationTarget = 'application'

/** Declares how Runtime must place one custom operation in a transaction. */
export type PluginOperationTransaction = 'forbidden' | 'optional' | 'required'

/** Validates and detaches one custom operation boundary value. */
export interface PluginOperationValueContract<TValue> {
	/** Returns one immutable snapshot or throws with the supplied public path. */
	snapshot(value: unknown, path: string): TValue
	/** Names the public TypeScript contract when Typegen is installed. */
	readonly typegen?: TypegenReference
}

/** Defines one stable namespaced custom operation token. */
export interface DefinePluginOperationOptions<
	TName extends string,
	TVersion extends string,
	TTarget extends PluginOperationTarget,
	TInput,
	TResult,
	TErrors extends readonly string[] = readonly [],
> {
	/** Stable namespaced name. @example `"community.workflow.publish-post"` */
	readonly name: TName
	/** Exact semantic protocol version. @example `"1.0.0"` */
	readonly version: TVersion
	/** Identifies an application operation; schema-bound work uses schema mutations. */
	readonly target: TTarget
	/** Validates and snapshots caller input before Runtime receives it. */
	readonly input: PluginOperationValueContract<TInput>
	/** Validates and snapshots the public result after Runtime handling. */
	readonly result: PluginOperationValueContract<TResult>
	/** Declares the transaction policy observed by Runtime. */
	readonly transaction: PluginOperationTransaction
	/** Declares the complete namespaced public error vocabulary for this operation. */
	readonly errors?: TErrors
}

declare const pluginOperationDefinitionType: unique symbol

/** Carries one inert operation contract without execution or transport state. */
export interface PluginOperationDefinition<
	TName extends string = string,
	TVersion extends string = string,
	TTarget extends PluginOperationTarget = PluginOperationTarget,
	TInput = unknown,
	TResult = unknown,
	TErrors extends readonly string[] = readonly string[],
> extends DefinePluginOperationOptions<
	TName,
	TVersion,
	TTarget,
	TInput,
	TResult,
	TErrors
> {
	readonly errors: TErrors
	readonly [pluginOperationDefinitionType]?: Readonly<{
		readonly input: TInput
		readonly result: TResult
		readonly errors: TErrors[number]
	}>
	readonly kind: 'plugin-operation'
}

/** Reads one operation token's exact input type. */
export type PluginOperationInput<TOperation> =
	TOperation extends PluginOperationDefinition<
		string,
		string,
		PluginOperationTarget,
		infer TInput
	>
		? TInput
		: never

/** Reads one operation token's exact result type. */
export type PluginOperationResult<TOperation> =
	TOperation extends PluginOperationDefinition<
		string,
		string,
		PluginOperationTarget,
		unknown,
		infer TResult
	>
		? TResult
		: never

/** Reads one operation token's declared public plugin-error codes. */
export type PluginOperationErrorCode<TOperation> =
	TOperation extends PluginOperationDefinition<
		string,
		string,
		PluginOperationTarget,
		unknown,
		unknown,
		infer TErrors
	>
		? TErrors[number]
		: never

const operationNames = new WeakSet<object>()
/** Creates one immutable operation value contract with exact inference. */
export const defineOperationValue = <TValue>(
	snapshot: (value: unknown, path: string) => TValue,
	typegen?: TypegenReference,
): PluginOperationValueContract<TValue> => {
	if (typeof snapshot !== 'function') {
		throw new TypeError('operation value snapshot must be a function')
	}

	if (typegen !== undefined && !isTypegenReference(typegen)) {
		throw new TypeError(
			'operation value typegen must be created by defineTypegenReference',
		)
	}

	return immutableRecord({
		snapshot,
		...(typegen === undefined ? {} : { typegen }),
	})
}

/** Creates one stable declaration token; execution is contributed separately. */
export const defineOperation = <
	const TName extends string,
	const TVersion extends string,
	const TTarget extends PluginOperationTarget,
	TInput,
	TResult,
	const TErrors extends readonly string[] = readonly [],
>(
	options: DefinePluginOperationOptions<
		TName,
		TVersion,
		TTarget,
		TInput,
		TResult,
		TErrors
	>,
): PluginOperationDefinition<
	TName,
	TVersion,
	TTarget,
	TInput,
	TResult,
	TErrors
> => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation definition must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (
			key !== 'errors' &&
			key !== 'input' &&
			key !== 'name' &&
			key !== 'result' &&
			key !== 'target' &&
			key !== 'transaction' &&
			key !== 'version'
		) {
			throw new TypeError(
				`operation definition contains unknown option: ${key}`,
			)
		}
	}

	assertOperationIdentity(options.name, options.version, 'operation')
	if (untrustedOptions.target !== 'application') {
		throw new TypeError('operation target must be application')
	}
	const transactions: ReadonlySet<unknown> = new Set([
		'forbidden',
		'optional',
		'required',
	])
	if (!transactions.has(untrustedOptions.transaction)) {
		throw new TypeError(
			'operation transaction must be forbidden, optional, or required',
		)
	}
	assertOperationValueContract(options.input, 'operation input')
	assertOperationValueContract(options.result, 'operation result')
	const errors = snapshotOperationErrors(options.errors, 'operation')

	const definition = immutableRecord({
		errors,
		input: options.input,
		kind: 'plugin-operation' as const,
		name: options.name,
		result: options.result,
		target: options.target,
		transaction: options.transaction,
		version: options.version,
	}) as PluginOperationDefinition<
		TName,
		TVersion,
		TTarget,
		TInput,
		TResult,
		TErrors
	>
	operationNames.add(definition)

	return definition
}

/** Narrows unknown input to a definition created by `defineOperation`. */
export const isPluginOperationDefinition = (
	value: unknown,
): value is PluginOperationDefinition =>
	typeof value === 'object' && value !== null && operationNames.has(value)
