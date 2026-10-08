import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import {
	assertPlainObject,
	haveSameEnumerableKeys,
} from '../../exact-object-validation.js'

import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/declaration-compatibility.js'
import { Schema } from '../../schema/schema/definition.js'
import type { PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import { assertVirtualFieldDefinition } from '../../schema/schema/virtual-field.js'
import { assertOutputDescriptor } from '../../schema/output/descriptor.js'
import { coreSchemaKeys } from '../../schema/schema/registry.js'
import type {
	PreparedSchemaBatch,
	SchemaCompilationResult,
} from './contracts.js'
import {
	assertSchemaCompilationProvenance,
	collectCompilationOwnerIdentities,
} from './provenance-validation.js'
import { assertFrozenPortable } from './values.js'
import type { SchemaCompilationValues } from './values.js'

const assertFrozenRecord = (value: unknown, path: string): void => {
	assertPlainObject(value, `${path} must be a plain object`)
	if (!Object.isFrozen(value)) throw new TypeError(`${path} must be immutable`)
}

const assertCandidate = (
	initial: PreparedSchemaCompilation,
	candidate: PreparedSchemaCompilation,
	owners: ReadonlySet<string>,
	values: SchemaCompilationValues,
): void => {
	const path = `schema compiler output.${initial.schema.className}`
	assertFrozenRecord(candidate, path)
	assertFrozenRecord(candidate.definition, path)
	const { definition } = candidate
	if (
		candidate.schema !== initial.schema ||
		!Schema.is(candidate.schema) ||
		definition.className !== initial.schema.className
	)
		throw new TypeError('Schema compiler output changed stable schema identity')
	for (const map of [
		definition.fields,
		definition.persistedFields,
		definition.virtualFields,
		candidate.developerFields,
	])
		assertFrozenRecord(map, path)
	assertFrozenPortable(definition.provenance, `${path}.provenance`)
	assertSchemaCompilationProvenance(
		definition.provenance,
		`${path}.provenance`,
		owners,
	)
	if (
		!areSchemaDeclarationValuesCompatible(
			definition.provenance.schema,
			initial.definition.provenance.schema,
		)
	)
		throw new TypeError(
			`Schema compiler output changed schema ownership: ${definition.className}`,
		)

	for (const name of ['id', 'createdAt', 'updatedAt']) {
		if (initial.definition.provenance.fields[name]?.owner.kind !== 'core')
			continue
		if (
			definition.persistedFields[name] !==
				initial.definition.persistedFields[name] ||
			!areSchemaDeclarationValuesCompatible(
				definition.provenance.fields[name],
				initial.definition.provenance.fields[name],
			) ||
			!areSchemaDeclarationValuesCompatible(
				definition.provenance.fieldOptions[name],
				initial.definition.provenance.fieldOptions[name],
			)
		)
			throw new TypeError(
				`Schema compiler output changed protected Core field: ${definition.className}.${name}`,
			)
	}
	if (
		!haveSameEnumerableKeys(
			definition.virtualFields,
			initial.definition.virtualFields,
		) ||
		Object.entries(initial.definition.virtualFields).some(
			([name, field], index) =>
				Object.keys(definition.virtualFields)[index] !== name ||
				definition.virtualFields[name] !== field ||
				!areSchemaDeclarationValuesCompatible(
					definition.provenance.fields[name],
					initial.definition.provenance.fields[name],
				) ||
				!areSchemaDeclarationValuesCompatible(
					definition.provenance.fieldOptions[name],
					initial.definition.provenance.fieldOptions[name],
				),
		)
	)
		throw new TypeError(
			`Schema compiler output changed a protected virtual field: ${definition.className}`,
		)
	for (const [name, field] of Object.entries(definition.virtualFields)) {
		assertVirtualFieldDefinition(field, `${path}.virtualFields.${name}`)
		assertOutputDescriptor(field.output, `${path}.virtualFields.${name}.output`)
		if (
			!field.select.includes('id') ||
			new Set(field.select).size !== field.select.length ||
			field.select.some(
				(dependency) =>
					!Object.hasOwn(definition.persistedFields, dependency) ||
					definition.persistedFields[dependency] === undefined ||
					definition.persistedFields[dependency].kind === 'relation',
			)
		)
			throw new TypeError(
				`${path}.virtualFields.${name}.select must reference persisted non-relation fields and retain id`,
			)
	}
	if (
		!haveSameEnumerableKeys(definition.fields, {
			...definition.persistedFields,
			...definition.virtualFields,
		}) ||
		Object.keys(definition.virtualFields).some((name) =>
			Object.hasOwn(definition.persistedFields, name),
		)
	)
		throw new TypeError(
			`${path}.fields must match persisted and virtual fields`,
		)
	for (const [name, field] of Object.entries(definition.persistedFields)) {
		values.assertField(field, `${path}.fields.${name}`)
		if (definition.fields[name] !== field)
			throw new TypeError(`${path}.fields.${name} has inconsistent identity`)
	}
	for (const [name, field] of Object.entries(definition.virtualFields)) {
		if (definition.fields[name] !== field)
			throw new TypeError(`${path}.fields.${name} has inconsistent identity`)
	}
	for (const [name, field] of Object.entries(candidate.developerFields)) {
		if (definition.fields[name] !== field)
			throw new TypeError(
				`Missing developer field in compiler output: ${definition.className}.${name}`,
			)
	}
	if (!haveSameEnumerableKeys(definition.provenance.fields, definition.fields))
		throw new TypeError(`${path}.provenance.fields must match schema fields`)
	if (
		!haveSameEnumerableKeys(
			definition.provenance.fieldOptions,
			definition.fields,
		)
	)
		throw new TypeError(
			`${path}.provenance.fieldOptions must match schema fields`,
		)
	for (const [name, field] of Object.entries(definition.fields)) {
		const options = definition.provenance.fieldOptions[name]
		if (
			options === undefined ||
			!haveSameEnumerableKeys(field.options, options)
		)
			throw new TypeError(
				`${path}.provenance.fieldOptions.${name} must match field options`,
			)
	}
	const options = Object.fromEntries(
		Object.entries(definition).filter(([name]) => !coreSchemaKeys.has(name)),
	)
	if (!haveSameEnumerableKeys(definition.provenance.options, options))
		throw new TypeError(`${path}.provenance.options must match schema options`)
	for (const [name, value] of Object.entries(options))
		values.assertOption(value, `${path}.options.${name}`)
	for (const key of ['constraints', 'indexes'] as const) {
		const nodes = definition[key]
		if (
			!isUnknownArray(nodes) ||
			!Object.isFrozen(nodes) ||
			nodes.length !== definition.provenance[key].length
		)
			throw new TypeError(`${path}.provenance.${key} must match ${key}`)
		for (const [index, node] of nodes.entries()) {
			assertFrozenPortable(node, `${path}.${key}.${String(index)}`)
			if (key === 'constraints')
				values.assertConstraint(node, `${path}.constraints.${String(index)}`)
			if (
				!areSchemaDeclarationValuesCompatible(
					node,
					definition.provenance[key][index]?.definition,
				)
			)
				throw new TypeError(
					`${path}.${key}[${String(index)}] has inconsistent provenance`,
				)
		}
	}
}

/** Mandatory after compilation and before command binding or atomic registry publication. */
export const assertSchemaCompilationResult = (
	initial: readonly PreparedSchemaCompilation[],
	batches: readonly PreparedSchemaBatch[],
	result: SchemaCompilationResult,
	values: SchemaCompilationValues,
): void => {
	assertFrozenRecord(result, 'schema compiler output')
	if (
		!isUnknownArray(result.candidates) ||
		!Object.isFrozen(result.candidates) ||
		result.candidates.length !== initial.length
	)
		throw new TypeError(
			'Schema compiler output must contain the complete schema graph',
		)
	const owners = collectCompilationOwnerIdentities({ declarations: batches })
	for (const [index, candidate] of result.candidates.entries()) {
		const expected = initial[index]
		if (expected === undefined)
			throw new TypeError(
				'Schema compiler output must contain the complete schema graph',
			)
		assertCandidate(expected, candidate, owners, values)
	}
	assertFrozenPortable(result.selections, 'schema compiler output.selections')
	if (!isUnknownArray(result.selections))
		throw new TypeError('Schema compiler output must contain selection lists')
	const expectedIds = new Set(
		batches.flatMap((batch) =>
			batch.selections.map((selection) => selection.selectionId),
		),
	)
	const returnedIds = new Set<string>()
	const names = new Set(initial.map((candidate) => candidate.schema.className))
	for (const selection of result.selections) {
		if (
			!isPlainRecord(selection) ||
			!expectedIds.has(selection.selectionId) ||
			returnedIds.has(selection.selectionId)
		)
			throw new TypeError(
				'Schema compiler output must resolve one exact declared selection',
			)
		returnedIds.add(selection.selectionId)
		if (
			!isUnknownArray(selection.classNames) ||
			new Set(selection.classNames).size !== selection.classNames.length ||
			selection.classNames.some((name) => !names.has(name))
		)
			throw new TypeError(
				'Schema compiler output contains an invalid schema target',
			)
	}
	if (returnedIds.size !== expectedIds.size)
		throw new TypeError(
			'Schema compiler output must resolve every declared selection',
		)
}
