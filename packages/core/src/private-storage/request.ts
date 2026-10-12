import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	assertExactEnumerableKeys,
	assertPlainObject,
} from '../exact-object-validation.js'

import { snapshotScalarFieldValue } from '../schema/fields/base/definition.js'
import type { FieldValidationPlan } from '../schema/plans/contracts.js'
import { validateScalarFieldShape } from '../schema/plans/scalar-shape-validation.js'
import type {
	PrivateStorageAdapterCollection,
	PrivateStorageOperationKind,
	PrivateStorageOperationRequest,
} from './adapter.js'

const assertPlainOperationValue = (
	value: unknown,
	path: string,
): Readonly<Record<string, unknown>> => {
	assertPlainObject(value, `${path} must be a plain object`)
	return value
}

const snapshotField = (
	plan: FieldValidationPlan,
	value: unknown,
	path: string,
	completeOptionalObjects: boolean,
): unknown => {
	if (value === null) {
		if (!plan.nullable) throw new TypeError(`${path} cannot be null`)
		return null
	}
	if (value === undefined) throw new TypeError(`${path} cannot be undefined`)
	if (plan.presence === 'forbidden') {
		throw new TypeError(`${path} cannot update an immutable field`)
	}

	switch (plan.kind) {
		case 'scalar': {
			const snapshot = snapshotScalarFieldValue(plan.field, value, path)
			const [issue] = validateScalarFieldShape(plan.field, snapshot, [path])
			if (issue !== undefined) throw new TypeError(`${path}: ${issue.message}`)
			return snapshot
		}
		case 'array':
			if (!isUnknownArray(value))
				throw new TypeError(`${path} must be an array`)
			return immutableArray(
				value.map((item, index) =>
					snapshotField(
						plan.items,
						item,
						`${path}[${String(index)}]`,
						completeOptionalObjects,
					),
				),
			)
		case 'object': {
			const input = assertPlainOperationValue(value, path)
			for (const name of Object.keys(input)) {
				// Inherited `Object.prototype` members are never declared fields.
				if (!Object.hasOwn(plan.fields, name)) {
					throw new TypeError(`${path} contains unknown field: ${name}`)
				}
			}
			return immutableRecord(
				Object.fromEntries(
					Object.entries(plan.fields).flatMap(([name, child]) => {
						if (Object.hasOwn(input, name)) {
							return [
								[
									name,
									snapshotField(
										child,
										input[name],
										`${path}.${name}`,
										completeOptionalObjects,
									),
								],
							]
						}
						if (child.presence === 'required') {
							throw new TypeError(`${path}.${name} is required`)
						}
						return completeOptionalObjects && child.nullable
							? [[name, null]]
							: []
					}),
				),
			)
		}
	}
}

const snapshotPartial = (
	collection: PrivateStorageAdapterCollection,
	value: unknown,
	path: string,
	allowImmutable: boolean,
	operation: 'create' | 'update' = 'create',
): Readonly<Record<string, unknown>> => {
	const input = assertPlainOperationValue(value, path)
	const entries = Object.entries(input)
	if (entries.length === 0) {
		throw new TypeError(`${path} must contain at least one field`)
	}
	return immutableRecord(
		Object.fromEntries(
			entries.map(([name, candidate]) => {
				const plans = Object.hasOwn(collection.fields, name)
					? collection.fields[name]
					: undefined
				if (plans === undefined) {
					throw new TypeError(`${path} contains unknown field: ${name}`)
				}
				if (
					!allowImmutable &&
					'immutable' in plans.create.field.options &&
					plans.create.field.options.immutable
				) {
					throw new TypeError(`${path} cannot update immutable field: ${name}`)
				}
				return [
					name,
					snapshotField(plans[operation], candidate, `${path}.${name}`, false),
				]
			}),
		),
	)
}

const snapshotWhere = (
	collection: PrivateStorageAdapterCollection,
	value: unknown,
	lookups = false,
): Readonly<Record<string, unknown>> => {
	const where = assertPlainOperationValue(value, 'private storage where')
	const names = Object.keys(where).sort()
	const candidates = lookups
		? [...collection.indexes, ...collection.lookups]
		: collection.indexes
	const matches = candidates.some(
		(index) =>
			index.fields.length === names.length &&
			[...index.fields]
				.sort()
				.every((name, position) => name === names[position]),
	)
	if (!matches) {
		throw new TypeError(
			lookups
				? 'private storage where must match one exact index or lookup'
				: 'private storage where must match one exact unique index',
		)
	}
	return snapshotPartial(collection, where, 'private storage where', true)
}

const snapshotInsert = (
	collection: PrivateStorageAdapterCollection,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	const input = assertPlainOperationValue(value, 'private storage data')
	for (const name of Object.keys(input)) {
		if (!Object.hasOwn(collection.fields, name)) {
			throw new TypeError(
				`private storage data contains unknown field: ${name}`,
			)
		}
	}
	return immutableRecord(
		Object.fromEntries(
			Object.entries(collection.fields).map(([name, { create }]) => {
				const present = Object.hasOwn(input, name)
				if (!present && create.presence === 'required') {
					throw new TypeError(`private storage data.${name} is required`)
				}
				return [
					name,
					present
						? snapshotField(
								create,
								input[name],
								`private storage data.${name}`,
								true,
							)
						: null,
				]
			}),
		),
	)
}

const operationKeys: Readonly<
	Record<PrivateStorageOperationKind, ReadonlySet<string>>
> = {
	'find-unique': new Set(['where']),
	'find-many': new Set(['limit', 'where']),
	insert: new Set(['data']),
	update: new Set(['data', 'where']),
	delete: new Set(['where']),
	'compare-and-swap': new Set(['data', 'expected', 'where']),
}

/** @internal Snapshots one owner request before it reaches an adapter. */
export const normalizePrivateStorageRequest = (
	collection: PrivateStorageAdapterCollection,
	kind: PrivateStorageOperationKind,
	options: unknown,
): PrivateStorageOperationRequest => {
	const input = assertPlainOperationValue(options, `private storage ${kind}`)
	assertExactEnumerableKeys(
		input,
		operationKeys[kind],
		`private storage ${kind} contains unknown option: `,
	)
	switch (kind) {
		case 'find-unique':
		case 'delete':
			return immutableRecord({
				collection,
				kind,
				where: snapshotWhere(collection, input.where),
			})
		case 'find-many': {
			const { limit } = input
			if (
				typeof limit !== 'number' ||
				!Number.isSafeInteger(limit) ||
				limit < 1 ||
				limit > 1000
			) {
				throw new TypeError(
					'private storage limit must be an integer from 1 through 1000',
				)
			}
			return immutableRecord({
				collection,
				kind,
				limit,
				where: snapshotWhere(collection, input.where, true),
			})
		}
		case 'insert':
			return immutableRecord({
				collection,
				data: snapshotInsert(collection, input.data),
				kind,
			})
		case 'update':
			return immutableRecord({
				collection,
				data: snapshotPartial(
					collection,
					input.data,
					'private storage data',
					false,
					'update',
				),
				kind,
				where: snapshotWhere(collection, input.where),
			})
		case 'compare-and-swap':
			return immutableRecord({
				collection,
				data: snapshotPartial(
					collection,
					input.data,
					'private storage data',
					false,
					'update',
				),
				expected: snapshotPartial(
					collection,
					input.expected,
					'private storage expected',
					true,
				),
				kind,
				where: snapshotWhere(collection, input.where),
			})
	}
}

/** @internal Revalidates every adapter result without publishing it to Runtime behavior. */
export const snapshotPrivateStorageResult = (
	collection: PrivateStorageAdapterCollection,
	value: unknown,
): Readonly<Record<string, unknown>> | null => {
	if (value === null) return null
	const record = assertPlainOperationValue(value, 'private storage result')
	const expected = Object.keys(collection.fields).sort()
	const actual = Object.keys(record).sort()
	if (
		expected.length !== actual.length ||
		!expected.every((name, index) => name === actual[index])
	) {
		throw new TypeError(
			'private storage result must contain the complete declared record',
		)
	}
	return immutableRecord(
		Object.fromEntries(
			expected.map((name) => {
				const plans = collection.fields[name]
				if (plans === undefined) {
					throw new TypeError(
						`private storage result contains unknown field: ${name}`,
					)
				}
				return [
					name,
					snapshotField(
						plans.create,
						record[name],
						`private storage result.${name}`,
						true,
					),
				]
			}),
		),
	)
}
