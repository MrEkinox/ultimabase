// `defineFunction` and `defineType` (D-27, D-109): a server operation, its
// access rule checked and its input validated on each `run` (D-75), and the
// named objects its output may hold.
import { refused } from './access.ts'
import type {
	FunctionDefinition,
	NamedOutput,
	Output,
	PluginRecord,
} from './definition.ts'
import {
	functionDefinitions,
	modelDefinitions,
	nullable,
	nullables,
	pluginEntries,
	typeDefinitions,
} from './definition.ts'
import { callerOf } from './engine.ts'
import { PublicError } from './errors.ts'
import type { StandardSchema } from './fields.ts'
import type {
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

function namedOf(value: unknown): NamedOutput | undefined {
	if (!isObject(value)) return undefined
	const model = modelDefinitions.get(value)
	if (model !== undefined) return { kind: 'model', value, name: model.name }
	const type = typeDefinitions.get(value)
	return type === undefined ? undefined : { kind: 'type', type }
}

/** An output's value, read once at its definition (D-109). */
function outputOf(value: unknown, where: string): Output {
	const standard = standardOf(value)
	if (standard !== undefined) return { kind: 'schema', schema: standard.schema }
	const named = namedOf(value)
	if (named !== undefined) return { ...named, form: 'one' }
	const marked = isObject(value) ? nullables.get(value) : undefined
	if (marked !== undefined) return { ...marked, form: 'nullable' }
	const list: readonly unknown[] = Array.isArray(value) ? value : []
	const listed = list.length === 1 ? namedOf(list[0]) : undefined
	if (listed !== undefined) return { ...listed, form: 'list' }
	throw new Error(
		`${where} is a model, a type, a list of one, X.nullable() or a Standard Schema (D-109).`,
	)
}

export function defineType<
	const N extends string,
	const F extends TypeFields,
>(definition: { readonly name: N; readonly fields: F }): ObjectType<N, F> {
	const { name, fields } = definition
	if (typeof name !== 'string' || name === '') {
		throw new Error('defineType takes a name.')
	}
	if (!isObject(fields) || Object.keys(fields).length === 0) {
		throw new Error(`${name}: fields is an object of one output or more.`)
	}
	const outputs = new Map<string, Output>()
	for (const [field, value] of Object.entries(fields)) {
		outputs.set(field, outputOf(value, `${name}.${field}`))
	}
	const recorded = { name, fields: outputs }
	const type: object = Object.freeze({
		name,
		nullable: (): object => nullable({ kind: 'type', type: recorded }),
	})
	typeDefinitions.set(type, recorded)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the value holds the name and `nullable`; its fields are a type only.
	return type as ObjectType<N, F>
}

function usesOf(name: string, use: unknown): readonly PluginRecord[] {
	if (!Array.isArray(use)) throw new Error(`${name}.use is a list.`)
	const uses: PluginRecord[] = []
	for (const value of use) {
		const entry = isObject(value) ? pluginEntries.get(value) : undefined
		if (entry === undefined) {
			throw new Error(`${name}.use lists a value no plugin's entry returned.`)
		}
		if (uses.some((other) => other.code.name === entry.code.name)) {
			throw new Error(`${name}.use lists ${entry.code.name} twice.`)
		}
		uses.push(entry)
	}
	return uses
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
		throw new TypeError(`${record.name}: access is a function (D-27).`)
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

async function called(
	value: object,
	record: FunctionDefinition,
	args: readonly unknown[],
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
	const caller = callerOf(options, name)
	return app.work.run(async () => {
		allowed(record, caller, app)
		const facts: { [key: string]: unknown } = { caller }
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
	const { name, query = false, input, output, run } = definition
	if (typeof name !== 'string' || name === '') {
		throw new Error('defineFunction takes a name.')
	}
	if (typeof query !== 'boolean')
		throw new Error(`${name}: query is a boolean.`)
	if (input !== undefined && standardOf(input) === undefined) {
		throw new Error(`${name}: input is a Standard Schema (D-27).`)
	}
	if (typeof run !== 'function') throw new Error(`${name}: run is a function.`)
	const record: FunctionDefinition = {
		name,
		query,
		input,
		output:
			output === undefined ? undefined : outputOf(output, `${name}.output`),
		uses: usesOf(name, definition.use ?? []),
		run,
		rules: undefined,
	}
	const fn: object = Object.freeze({
		name,
		input,
		output,
		// The rules are read on each call, so `.with` keeps the same value.
		with: (rules: unknown): object => {
			if (record.rules !== undefined) {
				throw new Error(`${name} takes its rules in one \`.with\`.`)
			}
			if (!isObject(rules)) throw new Error(`${name}.with takes an object.`)
			record.rules = rules
			return fn
		},
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
