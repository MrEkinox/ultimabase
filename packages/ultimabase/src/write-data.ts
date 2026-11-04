// A write's `data` before its hooks (D-67): checked for shape, then given
// its defaults, its types checked and its values validated (D-23, D-53).
import type { Issue } from './errors.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import type { ScalarCheck } from './query-where.ts'
import {
	entries,
	integerRange,
	isObject,
	misfit,
	unknownKey,
} from './query-where.ts'
import { checked, validated } from './validation.ts'
import type { OrCreate } from './relation-write.ts'
import { manyWrite, oneOfWrite, oneWrite } from './relation-write.ts'
import type { OneOfInfo } from './one-of-schema.ts'
import { hiddenKey } from './one-of-schema.ts'
import { refuseSet } from './relations.ts'

/** The data a `before*` hook changes in place (D-71). */
export type Draft = { [field: string]: unknown }

/** A value's issue; each element of a list fits its type (D-127). */
export function issueOf(
	value: unknown,
	field: ScalarCheck,
): string | undefined {
	if (!field.list) return misfit(value, field)
	const fit = (item: unknown) =>
		item !== '' && misfit(item, field) === undefined
	if (Array.isArray(value) && value.every(fit)) return undefined
	const of =
		field.type === 'enum'
			? `values among ${(field.values ?? []).join(', ')}`
			: field.integer === true
				? `whole numbers ${integerRange}`
				: field.type === 'number'
					? 'finite numbers'
					: 'non-empty strings without a NUL or a lone surrogate'
	return `Expected a list of ${of}.`
}

/**
 * The caller's data, its shape checked, as a draft the hooks may change: a
 * copy, down to the rows it creates and updates, which never write the
 * relation they are written through (D-128, D-138).
 */
export function readData(
	models: Models,
	model: ModelInfo,
	data: unknown,
	creating: boolean,
	at = 'data',
	inverse?: string,
): Draft {
	const draft: Draft = {}
	const back = inverse === undefined ? undefined : model.fields.get(inverse)
	// A `oneOf` written through one of its kinds is that kind's (D-247).
	const through = back?.kind === 'one' ? back.of?.field : undefined
	for (const [name, value] of entries(data, at)) {
		const field = model.fields.get(name)
		const path = `${at}.${name}`
		if (name === inverse || name === through) {
			throw new InvalidQuery(
				path,
				`${path} cannot be written: it links to the row being written.`,
			)
		}
		const oneOf = model.oneOfs.get(name)
		if (oneOf !== undefined) {
			draft[name] = oneOfData(models, model, oneOf, value, path, creating)
			continue
		}
		// A view is read-only (D-151, D-240); a oneOf's keys are hidden.
		if (
			field === undefined ||
			((field.kind === 'many' || (field.kind === 'one' && !field.stored)) &&
				field.from !== undefined) ||
			hiddenKey(field)
		) {
			throw unknownKey(path, model.name)
		}
		draft[name] = value
		if (field.kind === 'scalar') continue
		const target = models.get(field.target)
		const nested = (item: Draft, where: string, creates = true): Draft =>
			target === undefined
				? item
				: readData(models, target, item, creates, where, field.inverse)
		const orCreated = (item: OrCreate, where: string): OrCreate => ({
			where: item.where,
			create: nested(item.create, `${where}.create`),
		})
		if (field.kind === 'one') {
			const write = oneWrite(value, path, model.name, creating)
			const to = `${path}.${write.kind}`
			if (write.kind === 'create' || write.kind === 'update') {
				const copy = nested(write.data, to, write.kind === 'create')
				draft[name] = { [write.kind]: copy }
			} else if (write.kind === 'connectOrCreate') {
				draft[name] = { connectOrCreate: orCreated(write, to) }
			}
			continue
		}
		const write = manyWrite(value, path, model.name, creating)
		if (write.set !== undefined) refuseSet(model, name, `${path}.set`)
		const copy: Draft = { ...(isObject(value) ? value : {}) }
		const to = (key: string, index: number) => `${path}.${key}.${index}`
		if (Object.hasOwn(copy, 'create')) {
			copy['create'] = write.create.map((item, index) =>
				nested(item, to('create', index)),
			)
		}
		if (Object.hasOwn(copy, 'connectOrCreate')) {
			copy['connectOrCreate'] = write.connectOrCreate.map((item, index) =>
				orCreated(item, to('connectOrCreate', index)),
			)
		}
		if (Object.hasOwn(copy, 'update')) {
			copy['update'] = write.update.map((item, index) => ({
				where: item.where,
				data: nested(item.data, `${to('update', index)}.data`, false),
			}))
		}
		draft[name] = copy
	}
	return draft
}

/** A `oneOf` value (D-247), its nested rows read as its kind's target. */
function oneOfData(
	models: Models,
	model: ModelInfo,
	info: OneOfInfo,
	value: unknown,
	path: string,
	creating: boolean,
): Draft {
	const named = oneOfWrite(value, path, info, creating)
	if (named === undefined) return { disconnect: true }
	const { kind, write } = named
	const hidden = model.fields.get(named.field)
	const target = models.get(named.target)
	const at = `${path}.${write.kind}.${kind}`
	const nested = (item: Draft, where: string): Draft =>
		target === undefined || hidden?.kind !== 'one'
			? item
			: readData(models, target, item, true, where, hidden.inverse)
	const operand =
		write.kind === 'connect'
			? { id: write.id }
			: write.kind === 'create'
				? nested(write.data, at)
				: { where: write.where, create: nested(write.create, `${at}.create`) }
	return { [write.kind]: { [kind]: operand } }
}

/** A relation default's id: the target's `{ id }` or a record of it (D-53). */
function idOf(model: ModelInfo, field: FieldInfo, value: unknown): string {
	const id = isObject(value) ? value['id'] : undefined
	if (typeof id !== 'string') {
		throw new TypeError(
			`${model.name}.${field.name}: a relation's default is the target's { id } or a record of it.`,
		)
	}
	return id
}

function defaults(model: ModelInfo, draft: Draft, caller: Caller): void {
	for (const field of model.fields.values()) {
		if (Object.hasOwn(draft, field.name) || field.kind === 'many') continue
		const fallback = field.options['default']
		const value: unknown =
			typeof fallback === 'function'
				? Reflect.apply(fallback, undefined, [{ caller }])
				: fallback
		if (value === undefined) continue
		draft[field.name] =
			field.kind === 'one'
				? { connect: { id: idOf(model, field, value) } }
				: value
	}
}

/**
 * Gives a create its defaults, then checks each value's type and runs its
 * `validate`, whose output replaces it: defaults are validated, hook values
 * are not (D-67).
 */
export async function prepared(
	model: ModelInfo,
	draft: Draft,
	caller: Caller,
	creating: boolean,
	at: readonly (string | number)[] = [],
): Promise<void> {
	if (creating) defaults(model, draft, caller)
	const issues: Issue[] = []
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		if (field?.kind !== 'scalar' || value === null) continue
		const { codec } = field
		// A plugin field's schema takes the value or its JSON (D-122).
		const issue = codec === undefined ? issueOf(value, field) : undefined
		if (issue !== undefined) {
			issues.push({ path: [name], message: issue })
			continue
		}
		const result =
			codec === undefined
				? await validated(model, field, value)
				: await checked(codec.schema, value, [name], `${model.name}.${name}`)
		if ('issues' in result) issues.push(...result.issues)
		else draft[name] = result.value
	}
	if (issues.length > 0) {
		throw invalid(issues.map((one) => ({ ...one, path: [...at, ...one.path] })))
	}
}

export function invalid(issues: readonly Issue[]): PublicError {
	return new PublicError('VALIDATION_FAILED', 'Invalid data.', {
		details: { issues },
	})
}
