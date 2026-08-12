import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { valid } from 'semver'
import {
	isTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'

/** Names the application identity carried by one custom operation declaration. */
export type PluginOperationTarget = 'application' | 'model' | 'schema'

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
> {
	/** Stable namespaced name. @example `"community.workflow.publish-post"` */
	readonly name: TName
	/** Exact semantic protocol version. @example `"1.0.0"` */
	readonly version: TVersion
	/** Selects application, schema, or immutable model binding. */
	readonly target: TTarget
	/** Validates and snapshots caller input before Runtime receives it. */
	readonly input: PluginOperationValueContract<TInput>
	/** Validates and snapshots the public result after Runtime handling. */
	readonly result: PluginOperationValueContract<TResult>
	/** Declares the transaction policy observed by Runtime. */
	readonly transaction: PluginOperationTransaction
}

declare const pluginOperationDefinitionType: unique symbol

/** Carries one inert operation contract without execution or transport state. */
export interface PluginOperationDefinition<
	TName extends string = string,
	TVersion extends string = string,
	TTarget extends PluginOperationTarget = PluginOperationTarget,
	TInput = unknown,
	TResult = unknown,
> extends DefinePluginOperationOptions<
	TName,
	TVersion,
	TTarget,
	TInput,
	TResult
> {
	readonly [pluginOperationDefinitionType]?: Readonly<{
		readonly input: TInput
		readonly result: TResult
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

const operationNames = new WeakSet<object>()
const operationNamePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u

const assertOperationValueContract: (
	value: unknown,
	path: string,
) => asserts value is PluginOperationValueContract<unknown> = (value, path) => {
	if (!isPlainRecord(value) || typeof value.snapshot !== 'function') {
		throw new TypeError(`${path} must expose a snapshot function`)
	}

	for (const key of Object.keys(value)) {
		if (key !== 'snapshot' && key !== 'typegen') {
			throw new TypeError(`${path} contains unknown option: ${key}`)
		}
	}
	if (value.typegen !== undefined && !isTypegenReference(value.typegen)) {
		throw new TypeError(
			`${path}.typegen must be created by defineTypegenReference`,
		)
	}
}

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
>(
	options: DefinePluginOperationOptions<
		TName,
		TVersion,
		TTarget,
		TInput,
		TResult
	>,
): PluginOperationDefinition<TName, TVersion, TTarget, TInput, TResult> => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation definition must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (
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

	assertNonEmptyString(options.name, 'operation name')
	if (!operationNamePattern.test(options.name)) {
		throw new TypeError(`operation name must be namespaced: ${options.name}`)
	}
	if (valid(options.version) !== options.version) {
		throw new TypeError(
			`operation version must be exact SemVer: ${options.version}`,
		)
	}
	if (
		options.target !== 'application' &&
		options.target !== 'model' &&
		options.target !== 'schema'
	) {
		throw new TypeError(
			'operation target must be application, schema, or model',
		)
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

	const definition = immutableRecord({
		input: options.input,
		kind: 'plugin-operation' as const,
		name: options.name,
		result: options.result,
		target: options.target,
		transaction: options.transaction,
		version: options.version,
	}) as PluginOperationDefinition<TName, TVersion, TTarget, TInput, TResult>
	operationNames.add(definition)

	return definition
}

/** Narrows unknown input to a definition created by `defineOperation`. */
export const isPluginOperationDefinition = (
	value: unknown,
): value is PluginOperationDefinition =>
	typeof value === 'object' && value !== null && operationNames.has(value)
