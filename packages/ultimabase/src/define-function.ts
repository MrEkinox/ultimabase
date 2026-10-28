// `defineFunction` and `defineType` (D-27, D-109): a server operation, its
// access rule checked and its input validated on each `run` (D-75), and the
// named objects its output may hold.
import { refused } from './access.ts'
import type { FunctionDefinition, Output } from './definition.ts'
import {
	describedBy,
	functionDefinitions,
	nameOf,
	nullable,
	outputOf,
	typeDefinitions,
	withOnce,
} from './definition.ts'
import { entriesOf } from './plugin-use.ts'
import { callerOf } from './engine.ts'
import { PublicError, Refused } from './errors.ts'
import type { StandardSchema } from './fields.ts'
import type {
	Client,
	FunctionPlugin,
	FunctionWithKeys,
	InputCheck,
	ObjectType,
	OutputSpec,
	ResultOf,
	RunFacts,
	ServerFunction,
	TypeFields,
} from './function.ts'
import type { ModelUse } from './plugin.ts'
import { isObject } from './query-where.ts'
import type { Caller } from './rules.ts'
import { isMaster } from './rules.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import { checked, standardOf } from './validation.ts'

export function defineType<
	const N extends string,
	const F extends TypeFields,
>(definition: {
	readonly name: N
	/** What the type means, which the transports show (D-150). */
	readonly description?: string
	readonly fields: F
}): ObjectType<N, F> {
	const { fields } = definition
	const name = nameOf(definition.name, 'defineType')
	const description = describedBy(definition.description, name)
	if (!isObject(fields) || Object.keys(fields).length === 0) {
		throw new Refused(`${name}: fields is an object of one output or more.`)
	}
	const outputs = new Map<string, Output>()
	for (const [field, value] of Object.entries(fields)) {
		outputs.set(field, outputOf(value, `${name}.${field}`))
	}
	const recorded = { name, description, fields: outputs }
	const type: object = Object.freeze({
		name,
		nullable: (): object => nullable({ kind: 'type', type: recorded }),
	})
	typeDefinitions.set(type, recorded)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the value holds the name and `nullable`; its fields are a type only.
	return type as ObjectType<N, F>
}

/** Closed to all but Master by default (D-04); the rule reads the caller. */
function allowed(
	record: FunctionDefinition,
	caller: Caller,
	app: Running,
): void {
	if (isMaster(caller)) return
	const rule = isObject(record.rules) ? record.rules['access'] : undefined
	if (rule !== undefined && typeof rule !== 'function') {
		throw new TypeError(`${record.name}: access is a function.`)
	}
	const result: unknown =
		rule === undefined ? false : Reflect.apply(rule, undefined, [{ caller }])
	if (typeof result !== 'boolean') {
		throw new TypeError(`${record.name}: access returns a boolean.`)
	}
	if (result) return
	const { name } = record
	throw refused({ function: name }, `${name} refused.`, caller, app.logger)
}

/** `run`'s call, the input first when the function takes one; a transport
 * passes its client (D-113). */
export async function called(
	value: object,
	record: FunctionDefinition,
	args: readonly unknown[],
	client?: Client,
): Promise<unknown> {
	const app = current()
	if (app?.functions.get(value) !== record) {
		throw new Error(
			`${record.name} is not a function of a started application.`,
		)
	}
	const { input: schema, name } = record
	const [input, options] =
		schema === undefined ? [undefined, args[0]] : [args[0], args[1]]
	const identity = callerOf(options, name)
	return app.work.run(async () => {
		const caller = await app.complete(identity)
		allowed(record, caller, app)
		const facts: { [key: string]: unknown } = { caller, client }
		const standard = standardOf(schema)
		if (standard !== undefined) {
			const result = await checked(standard, input, [], name)
			if ('issues' in result) {
				throw new PublicError('VALIDATION_FAILED', 'Invalid input.', {
					details: { issues: result.issues },
				})
			}
			facts['input'] = result.value
		}
		const output: unknown = await Reflect.apply(record.run, undefined, [
			Object.freeze(facts),
		])
		return record.output === undefined ? undefined : output
	})
}

export function defineFunction<
	const N extends string,
	const O extends OutputSpec | undefined = undefined,
	const I extends StandardSchema | undefined = undefined,
	const U extends readonly ModelUse<string, FunctionPlugin>[] = [],
>(
	definition: {
		readonly name: N
		/** What the function does, which the transports show (D-150). */
		readonly description?: string
		/** A query, served over GET too; a mutation by default (D-109). */
		readonly query?: boolean
		readonly use?: U
		readonly input?: I
		readonly output?: O
		readonly run: (
			facts: RunFacts<NoInfer<I>>,
		) => NoInfer<ResultOf<O>> | Promise<NoInfer<ResultOf<O>>>
	} & NoInfer<InputCheck<I>>,
): ServerFunction<N, I, O, U[number]['plugin'], FunctionWithKeys<U[number]>> {
	const { query = false, input, output, run } = definition
	const name = nameOf(definition.name, 'defineFunction')
	const description = describedBy(definition.description, name)
	if (typeof query !== 'boolean')
		throw new Refused(`${name}: query is a boolean.`)
	if (input !== undefined && standardOf(input) === undefined) {
		throw new Refused(`${name}: input is a Standard Schema.`)
	}
	if (typeof run !== 'function')
		throw new Refused(`${name}: run is a function.`)
	const record: FunctionDefinition = {
		name,
		description,
		query,
		input,
		output:
			output === undefined ? undefined : outputOf(output, `${name}.output`),
		uses: entriesOf(name, definition.use ?? []),
		run,
		rules: undefined,
	}
	const fn: object = Object.freeze({
		name,
		input,
		output,
		with: withOnce(name, record, () => fn),
		run: async (...args: unknown[]): Promise<unknown> =>
			called(fn, record, args),
	})
	functionDefinitions.set(fn, record)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the value ServerFunction describes; its types follow the definition.
	return fn as unknown as ServerFunction<
		N,
		I,
		O,
		U[number]['plugin'],
		FunctionWithKeys<U[number]>
	>
}
