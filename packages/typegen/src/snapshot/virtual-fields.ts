import type {
	GenericOutputDescriptor,
	GenericVirtualField,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	TypegenFieldSnapshot,
	TypegenValueNode,
	TypegenVirtualFieldSnapshot,
} from '../snapshot.js'
import {
	displayPathOf,
	pluginValue,
	readOptionalString,
	scalarValue,
	sortedEntries,
	unsupported,
	type FieldSnapshotContext,
} from './fields.js'

const snapshotOutputValue = (
	descriptor: GenericOutputDescriptor,
	schema: SchemaDefinition,
	path: readonly string[],
	context: FieldSnapshotContext,
): TypegenValueNode => {
	const displayPath = displayPathOf(schema, path)
	const options = descriptor.options
	const typeName = (): string | undefined =>
		readOptionalString(
			Reflect.get(options, 'typeName'),
			`${displayPath}.typeName`,
		)

	switch (descriptor.kind) {
		case 'enum': {
			const values: unknown = Reflect.get(options, 'values')

			if (
				!isUnknownArray(values) ||
				!values.every((value) => typeof value === 'string')
			) {
				throw unsupported(
					`Virtual enum ${displayPath} has no stable string values`,
					displayPath,
				)
			}

			return immutableRecord({
				kind: 'enum',
				typeName: typeName(),
				values: immutableArray([...values].sort()),
			})
		}
		case 'object': {
			const fields: unknown = Reflect.get(options, 'fields')

			if (!isPlainRecord(fields)) {
				throw unsupported(
					`Virtual object ${displayPath} has no stable child descriptors`,
					displayPath,
				)
			}

			return immutableRecord({
				fields: snapshotOutputFields(fields, schema, path, context),
				kind: 'object',
				typeName: typeName(),
			})
		}
		default:
			return (
				scalarValue(descriptor.kind) ??
				pluginValue(descriptor.kind, 'Virtual field', displayPath, context)
			)
	}
}

const snapshotOutputFields = (
	fields: Readonly<Record<string, unknown>>,
	schema: SchemaDefinition,
	parentPath: readonly string[],
	context: FieldSnapshotContext,
): readonly TypegenFieldSnapshot[] =>
	immutableArray(
		sortedEntries(fields).map(([name, candidate]) => {
			const path = immutableArray([...parentPath, name])

			if (
				typeof candidate !== 'object' ||
				candidate === null ||
				!('kind' in candidate) ||
				!('options' in candidate)
			) {
				const displayPath = displayPathOf(schema, path)

				throw unsupported(
					`Virtual output ${displayPath} is invalid`,
					displayPath,
				)
			}

			// Core only exposes compiled output descriptors here; the shape checks
			// above keep foreign values from reaching the property reads below.
			const descriptor = candidate as GenericOutputDescriptor

			return immutableRecord({
				description:
					typeof descriptor.options.description === 'string'
						? descriptor.options.description
						: undefined,
				kind: descriptor.kind,
				name,
				outputOnly: true as const,
				path,
				portableEquality: false,
				structuralContains: undefined,
				typegen: immutableRecord({
					create: 'forbidden' as const,
					list: descriptor.options.list,
					nullable: descriptor.options.nullable,
					object: 'required' as const,
					update: 'forbidden' as const,
				}),
				value: snapshotOutputValue(descriptor, schema, path, context),
			})
		}),
	)

/** Converts compiled virtual fields into callback-free Typegen metadata. */
export const snapshotVirtualFields = (
	fields: Readonly<Record<string, GenericVirtualField>>,
	schema: SchemaDefinition,
	context: FieldSnapshotContext,
): readonly TypegenVirtualFieldSnapshot[] =>
	immutableArray(
		sortedEntries(fields).map(([name, field]) => {
			const [snapshot] = snapshotOutputFields(
				{ [name]: field.output },
				schema,
				[],
				context,
			)

			if (snapshot === undefined) {
				throw unsupported(
					`Virtual field ${schema.className}.${name} has no output`,
					`${schema.className}.${name}`,
				)
			}

			return immutableRecord({
				...snapshot,
				description:
					typeof field.options.description === 'string'
						? field.options.description
						: snapshot.description,
				select: immutableArray(field.select),
			})
		}),
	)
