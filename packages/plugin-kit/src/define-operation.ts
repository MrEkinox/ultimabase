import type { StandardSchemaV1 } from '@standard-schema/spec'
import { FrameworkError, toJSON, type JsonValue } from '@ultimabase/core'
import {
	contributeOperation,
	defineOperation as defineOperationToken,
	defineOperationValue,
	plugin,
	type PluginInstance,
	type RequestContext,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

/** What an application operation's handler receives. */
export interface OperationHandlerInput<TInput> {
	/** The input, already validated by `input` (its output, transforms applied). */
	readonly input: TInput
	/**
	 * The request context: `getRequestPrincipal(context)` reads the caller.
	 * Schema reads and writes in the handler run with the caller's authority.
	 */
	readonly context: RequestContext
}

/** Declares one application operation (see {@link defineOperation}). */
export interface DefineOperationOptions<
	TName extends string,
	TInput extends StandardSchemaV1,
	TOutput extends StandardSchemaV1,
> {
	/**
	 * Client-facing camelCase name, unique in the application.
	 * @example `name: 'createInvoice'` (`POST /api/operations/createInvoice`)
	 */
	readonly name: TName
	/**
	 * Standard Schema validator (Zod, Valibot, ArkType…) of the input; its
	 * issues reach the client as a `VALIDATION_ERROR`.
	 * @example `input: z.object({ amount: z.number().positive() })`
	 */
	readonly input: TInput
	/**
	 * Standard Schema validator of the result; a result it rejects is a
	 * server error, never sent to the client.
	 * @example `output: z.object({ invoiceId: z.string() })`
	 */
	readonly output: TOutput
	/**
	 * Runs the operation with the validated input.
	 * @example `handler: async ({ input }) => ({ invoiceId: await bill(input) })`
	 */
	readonly handler: (
		input: OperationHandlerInput<StandardSchemaV1.InferOutput<TInput>>,
	) => MaybePromise<StandardSchemaV1.InferInput<TOutput>>
}

/** One application operation, installed with `UltimaBase.use(operation)`. */
export type ApplicationOperation<TName extends string = string> =
	PluginInstance<{
		readonly id: typeof applicationOperationPluginId
		readonly instanceId: TName
		readonly version: '1.0.0'
		readonly core: '^0.0.0'
	}>

const applicationOperationPluginId = 'application.operations' as const
const namePattern = /^[a-z][A-Za-z0-9]*$/u

const optionKeys = new Set(['handler', 'input', 'name', 'output'])

const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
	(typeof value === 'object' || typeof value === 'function') &&
	value !== null &&
	isPlainRecord(Reflect.get(value, '~standard')) &&
	typeof Reflect.get(Reflect.get(value, '~standard'), 'validate') === 'function'

/** Converts one Standard Schema path segment into an issue path segment. */
const pathSegment = (
	segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number => {
	const key = typeof segment === 'object' ? segment.key : segment
	return typeof key === 'number' ? key : String(key)
}

/** Converts `camelCase` into the `kebab-case` of a namespaced Core name. */
const kebabCase = (value: string): string =>
	value.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase()

/** Narrows a value produced by a JSON Schema converter to plain JSON. */
const toJsonValue = (value: unknown): JsonValue | undefined => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	) {
		return value
	}
	if (Array.isArray(value)) {
		const items: JsonValue[] = []
		for (const item of value) {
			const json = toJsonValue(item)
			if (json === undefined) return undefined
			items.push(json)
		}
		return items
	}
	if (!isPlainRecord(value)) return undefined
	const entries: [string, JsonValue][] = []
	for (const [key, item] of Object.entries(value)) {
		const json = toJsonValue(item)
		if (json === undefined) return undefined
		entries.push([key, json])
	}
	return Object.fromEntries(entries)
}

/** Describes one validator as JSON Schema when it implements Standard JSON Schema. */
const describe = (
	validator: StandardSchemaV1,
	direction: 'input' | 'output',
): JsonValue | undefined => {
	const converter: unknown = Reflect.get(validator['~standard'], 'jsonSchema')
	if (typeof converter !== 'object' || converter === null) return undefined
	const convert: unknown = Reflect.get(converter, direction)
	if (typeof convert !== 'function') return undefined
	try {
		const schema: unknown = Reflect.apply(convert, converter, [
			{ target: 'draft-2020-12' },
		])
		if (!isPlainRecord(schema)) return undefined
		// The OpenAPI document declares its own dialect.
		return toJsonValue(
			Object.fromEntries(
				Object.entries(schema).filter(([key]) => key !== '$schema'),
			),
		)
	} catch {
		// A validator that cannot describe itself stays undocumented.
		return undefined
	}
}

// Wire values are JSON; results go through `toJSON` like REST results (ADR-0310).
const jsonInput = defineOperationValue<unknown>((value, path) => {
	try {
		return deepFreeze(JSON.parse(JSON.stringify(value ?? null)) as unknown)
	} catch {
		throw new TypeError(`${path} must be JSON`)
	}
})
const jsonResult = defineOperationValue<unknown>((value) =>
	deepFreeze(JSON.parse(JSON.stringify(toJSON(value))) as unknown),
)

const deepFreeze = <TValue>(value: TValue): TValue => {
	if (typeof value === 'object' && value !== null) {
		for (const item of Object.values(value)) deepFreeze(item)
		Object.freeze(value)
	}
	return value
}

/**
 * Declares an application operation without writing a plugin (ADR-0324):
 * install it with `UltimaBase.use(operation)`; every installed transport
 * exposes it like a public plugin operation (`POST /api/operations/<name>`).
 *
 * @example
 * ```ts
 * export const createInvoice = defineOperation({
 *   name: 'createInvoice',
 *   input: z.object({ amount: z.number().positive() }),
 *   output: z.object({ invoiceId: z.string() }),
 *   handler: async ({ input }) => ({ invoiceId: await bill(input.amount) }),
 * })
 * ```
 */
export const defineOperation = <
	const TName extends string,
	TInput extends StandardSchemaV1,
	TOutput extends StandardSchemaV1,
>(
	options: DefineOperationOptions<TName, TInput, TOutput>,
): ApplicationOperation<TName> => {
	const untrusted: unknown = options
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('defineOperation options must be a plain object')
	}
	const unknownKey = Object.keys(untrusted).find((key) => !optionKeys.has(key))
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown defineOperation option: ${unknownKey}`)
	}
	const { handler, input, name, output } = untrusted
	if (typeof name !== 'string' || !namePattern.test(name)) {
		throw new TypeError(
			'defineOperation name must be a camelCase identifier, such as createInvoice',
		)
	}
	if (!isStandardSchema(input) || !isStandardSchema(output)) {
		throw new TypeError(
			`defineOperation ${name} input and output must be Standard Schema validators`,
		)
	}
	if (typeof handler !== 'function') {
		throw new TypeError(`defineOperation ${name} handler must be a function`)
	}
	const operation = defineOperationToken({
		input: jsonInput,
		name: `application.${kebabCase(name)}`,
		result: jsonResult,
		target: 'application',
		transaction: 'optional',
		version: '1.0.0',
	})
	const inputSchema = describe(input, 'input')
	const outputSchema = describe(output, 'output')
	return plugin({
		id: applicationOperationPluginId,
		instanceId: options.name,
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			contributeOperation({
				operation,
				public: {
					name,
					...(inputSchema === undefined ? {} : { input: inputSchema }),
					...(outputSchema === undefined ? {} : { output: outputSchema }),
				},
				execute: async ({ context, input: value }) => {
					const validated = await options.input['~standard'].validate(value)
					if (validated.issues !== undefined) {
						const issues = immutableArray(
							validated.issues.map((issue) =>
								immutableRecord({
									code: 'operation.input',
									message: issue.message,
									path: immutableArray([
										'input',
										...(issue.path ?? []).map(pathSegment),
									]),
								}),
							),
						)
						throw new FrameworkError(
							'VALIDATION_ERROR',
							`Operation ${name} input is invalid.`,
							{
								publicMessage: 'The operation input is invalid.',
								publicDetails: { issues },
								internalDetails: { issues },
							},
						)
					}
					const result = await options.handler({
						context,
						input: validated.value,
					})
					const checked = await options.output['~standard'].validate(result)
					if (checked.issues !== undefined) {
						throw new TypeError(
							`Operation ${name} result does not match its output validator: ${checked.issues.map(({ message }) => message).join('; ')}`,
						)
					}
					return checked.value
				},
			}),
		],
	})
}
