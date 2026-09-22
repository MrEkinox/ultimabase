import {
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	snapshotScalarFieldValue,
} from '../../schema/index.js'
import { snapshotJsonValue } from '../../schema/fields/base/portable-json.js'
import { snapshotPluginFieldStructuralContainsOperand } from '../../schema/fields/base/definition.js'
import {
	getFieldListDepth,
	isFieldNullable,
} from '../../schema/fields/base/options.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	queryEqualityFieldKinds,
	queryOrderedFieldKinds,
	type QueryComparisonFilterOperator,
	type QueryEqualityFilterOperator,
	type QueryJsonPathFilterOperator,
	type QueryKeyFilterOperator,
	type QueryMembershipFilterOperator,
	type QueryRangeFilterOperator,
	type QueryRegexFlag,
	type QueryStringFilterOperator,
	type QueryStructuralContainmentFilterOperator,
} from './primitive.js'
import {
	readObjectChildFields,
	type ResolvedQueryTarget,
	type RuntimeQueryField,
} from './target.js'

const includesString = (values: readonly string[], value: string): boolean =>
	values.some((candidate) => candidate === value)

export const hasListShape = (field: RuntimeQueryField): boolean =>
	'list' in field.options &&
	field.options.list !== false &&
	field.options.list !== undefined

export const assertOperatorSupport = (
	field: RuntimeQueryField,
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryMembershipFilterOperator
		| QueryRangeFilterOperator
		| QueryStringFilterOperator
		| QueryStructuralContainmentFilterOperator
		| QueryJsonPathFilterOperator
		| QueryKeyFilterOperator
		| 'null'
		| 'regex',
): void => {
	if (operator === 'null') {
		if (field.kind === 'relation') {
			throw new TypeError(
				'query operator null does not support relation fields',
			)
		}

		return
	}

	if (hasListShape(field)) {
		if (operator === 'equal' || operator === 'not-equal') {
			return
		}

		throw new TypeError(
			`query operator ${operator} does not support list fields`,
		)
	}

	if (
		operator === 'contained-by' ||
		operator === 'json-path-exists' ||
		operator === 'json-path-matches' ||
		operator === 'has-key' ||
		operator === 'has-any-keys' ||
		operator === 'has-all-keys'
	) {
		if (field.kind === 'json' || field.kind === 'object') {
			return
		}

		throw new TypeError(
			`query operator ${operator} does not support ${field.kind} fields`,
		)
	}

	const supported =
		operator === 'equal' ||
		operator === 'not-equal' ||
		operator === 'in' ||
		operator === 'not-in'
			? includesString(queryEqualityFieldKinds, field.kind) ||
				getPluginFieldStorageCodec(field) !== undefined
			: operator === 'greater-than' ||
				  operator === 'greater-than-or-equal' ||
				  operator === 'less-than' ||
				  operator === 'less-than-or-equal' ||
				  operator === 'between' ||
				  operator === 'not-between'
				? includesString(queryOrderedFieldKinds, field.kind)
				: operator === 'contains'
					? field.kind === 'string' ||
						field.kind === 'json' ||
						field.kind === 'object' ||
						getPluginFieldStructuralContains(field) !== undefined
					: field.kind === 'string'

	if (!supported) {
		throw new TypeError(
			`query operator ${operator} does not support ${field.kind} fields`,
		)
	}
}

const snapshotPartialField = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
	listDepth = getFieldListDepth(field.options),
	allowNull = true,
): unknown => {
	if (allowNull && value === null && isFieldNullable(field)) {
		return null
	}

	if (listDepth > 0) {
		if (!isUnknownArray(value)) {
			throw new TypeError(`${path} must be a list`)
		}

		return immutableArray(
			value.map((item, index) =>
				snapshotPartialField(
					field,
					item,
					`${path}[${String(index)}]`,
					listDepth - 1,
					false,
				),
			),
		)
	}

	return field.kind === 'object'
		? snapshotPartialObject(field, value, path)
		: snapshotScalarFieldValue(field, value, path)
}

const snapshotPartialObject = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	const fields = readObjectChildFields(field)

	if (fields === undefined) {
		throw new TypeError(`${path} requires object field metadata`)
	}

	const entries: [string, unknown][] = Object.entries(value).map(
		([name, item]) => {
			const child = fields[name]

			if (child === undefined) {
				throw new TypeError(`${path}.${name} is not a declared field`)
			}

			return [name, snapshotPartialField(child, item, `${path}.${name}`)]
		},
	)

	return immutableRecord(Object.fromEntries(entries))
}

export const snapshotStructuralValue = (
	field: RuntimeQueryField | undefined,
	value: unknown,
	path: string,
): unknown => {
	if (field === undefined) {
		return snapshotJsonValue(value, path)
	}

	if (getPluginFieldStructuralContains(field) !== undefined) {
		return snapshotPluginFieldStructuralContainsOperand(field, value, path)
	}

	return field.kind === 'object'
		? snapshotPartialObject(field, value, path)
		: snapshotScalarFieldValue(field, value, path)
}

export const queryTargetProperties = (
	target: ResolvedQueryTarget,
): Readonly<{
	field: string
	path?: readonly [string, ...string[]]
}> =>
	target.path === undefined
		? { field: target.fieldName }
		: { field: target.fieldName, path: target.path }

export const snapshotQueryValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null && isFieldNullable(field)) {
		return null
	}

	if (hasListShape(field)) {
		return snapshotQueryList(field, value, path)
	}

	return snapshotScalarFieldValue(field, value, path)
}

export const snapshotQueryListElement = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null) {
		throw new TypeError(`${path} must not be null`)
	}

	return snapshotScalarFieldValue(field, value, path)
}

export const snapshotQueryList = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): readonly unknown[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be a list`)
	}

	return immutableArray(
		value.map((item, index) =>
			snapshotQueryListElement(field, item, `${path}[${String(index)}]`),
		),
	)
}

export const snapshotQueryNonNullValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null) {
		throw new TypeError(`${path} must not be null`)
	}

	return snapshotScalarFieldValue(field, value, path)
}

export const isNullableValueOperator = (
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryStringFilterOperator,
): operator is QueryEqualityFilterOperator =>
	operator === 'equal' || operator === 'not-equal'

export const isQueryRegexFlag = (value: unknown): value is QueryRegexFlag =>
	value === 'case-insensitive' ||
	value === 'dot-matches-newline' ||
	value === 'multiline'
