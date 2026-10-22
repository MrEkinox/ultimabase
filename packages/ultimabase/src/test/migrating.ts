// `memory()` with fake `migrations` (D-105): the snapshot lists each model's
// fields, and the plan adds or removes models and fields.
import type { Adapter, Logger, Run, Statement, Stored } from '../index.ts'
import { memory } from '../index.ts'

export type FakeState = { stored: Stored | undefined; runs: Run[] }

type Models = { readonly [model: string]: readonly string[] }

function modelsOf(value: unknown): Models {
	const models: unknown =
		typeof value === 'object' && value !== null
			? Reflect.get(value, 'models')
			: undefined
	if (typeof models !== 'object' || models === null) {
		throw new Error('Not a fake snapshot.')
	}
	const read: Record<string, string[]> = {}
	for (const [name, fields] of Object.entries(models)) {
		if (!Array.isArray(fields)) throw new Error('Not a fake snapshot.')
		read[name] = fields.map(String)
	}
	return read
}

function plan(from: unknown, to: unknown): Statement[] {
	const before = from === undefined ? {} : modelsOf(from)
	const after = modelsOf(to)
	const statements: Statement[] = []
	for (const [model, fields] of Object.entries(before)) {
		const now = after[model]
		if (now === undefined) {
			statements.push({
				sql: `drop ${model}`,
				model,
				does: 'removed',
				loses: `removing ${model} deletes its rows`,
			})
			continue
		}
		const fresh = now.filter((field) => !fields.includes(field))
		for (const field of fields.filter((given) => !now.includes(given))) {
			const twin = fresh[0]
			statements.push({
				sql: `drop ${model}.${field}`,
				model,
				does: `removed ${field}`,
				loses: `removing "${model}.${field}" deletes data`,
				...(twin === undefined
					? {}
					: {
							rename: {
								to: `${model}.${twin}`,
								dbName: field,
								sql: `rename ${field} to ${twin}`,
							},
						}),
			})
		}
		for (const field of fresh) {
			statements.push({
				sql: `add ${model}.${field}`,
				model,
				does: `added ${field}`,
			})
		}
	}
	for (const model of Object.keys(after)) {
		if (before[model] !== undefined) continue
		statements.push({ sql: `create ${model}`, model, does: 'created' })
	}
	return statements
}

/** The states configs share with the tests that write them, by name. */
export const states = new Map<string, FakeState>()

export function fakeState(name?: string): FakeState {
	const known = name === undefined ? undefined : states.get(name)
	if (known !== undefined) return known
	const state: FakeState = { stored: undefined, runs: [] }
	if (name !== undefined) states.set(name, state)
	return state
}

export function migrating(state: FakeState = fakeState()): Adapter {
	return {
		...memory(),
		migrations: {
			snapshot: (schema) => ({
				models: Object.fromEntries(
					schema.models.map((model) => [
						model.name,
						model.fields.map((field) => field.name),
					]),
				),
			}),
			plan,
			stored: async () => state.stored,
			apply: async (run) => {
				state.runs.push(run)
				const applied = state.stored?.applied ?? []
				state.stored =
					run.kind === 'sync'
						? { snapshot: run.to, by: 'sync', applied }
						: {
								snapshot: run.to,
								by: 'deploy',
								applied: [
									...applied,
									...run.files.map(({ name, checksum }) => ({
										name,
										checksum,
									})),
								],
							}
			},
		},
	}
}

/** The lines of the loggers configs record, by name. */
export const logs = new Map<string, string[]>()

/** A logger that keeps its `info` messages, under `name` if given. */
export function recording(
	name?: string,
): Logger & { readonly lines: string[] } {
	const lines: string[] = []
	if (name !== undefined) logs.set(name, lines)
	const logger: Logger & { readonly lines: string[] } = {
		lines,
		info: (first: string | object, message?: string) => {
			lines.push(typeof first === 'string' ? first : (message ?? ''))
		},
		warn: () => undefined,
		error: () => undefined,
		child: () => logger,
	}
	return logger
}
