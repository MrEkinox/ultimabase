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

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenFieldSnapshot,
	TypegenReference,
	TypegenValueNode,
	TypegenVirtualFieldSnapshot,
} from '../snapshot.js'

interface VirtualSnapshotContext {
	readonly pluginValues: ReadonlyMap<string, TypegenReference>
}

const readOptionalString = (
	value: unknown,
	path: string,
): string | undefined => {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string') {
		throw new SchemaTypegenError(
			'unsupported-field-kind',
			`${path} must be a string`,
			{ path },
		)
	}

	return value
}

const snapshotOutputValue = (
	descriptor: GenericOutputDescriptor,
	schema: SchemaDefinition,
	path: readonly string[],
	context: VirtualSnapshotContext,
): TypegenValueNode => {
	const displayPath = `${schema.className}.${path.join('.')}`
	const options = descriptor.options

	switch (descriptor.kind) {
		case 'bigint':
			return immutableRecord({ kind: 'bigint' })
		case 'binary':
			return immutableRecord({ kind: 'bytes' })
		case 'boolean':
			return immutableRecord({ kind: 'boolean' })
		case 'date':
		case 'dateTime':
		case 'decimal':
		case 'string':
		case 'time':
		case 'uuid':
			return immutableRecord({ kind: 'string' })
		case 'enum': {
			const values: unknown = Reflect.get(options, 'values')
			if (
				!isUnknownArray(values) ||
				!values.every((value) => typeof value === 'string')
			) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Virtual enum ${displayPath} has no stable string values`,
					{ path: displayPath },
				)
			}
			return immutableRecord({
				kind: 'enum',
				typeName: readOptionalString(
					Reflect.get(options, 'typeName'),
					`${displayPath}.typeName`,
				),
				values: immutableArray([...values].sort()),
			})
		}
		case 'float':
		case 'int':
			return immutableRecord({ kind: 'number' })
		case 'json':
			return immutableRecord({ kind: 'json' })
		case 'object': {
			const fields: unknown = Reflect.get(options, 'fields')
			if (!isPlainRecord(fields)) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Virtual object ${displayPath} has no stable child descriptors`,
					{ path: displayPath },
				)
			}
			return immutableRecord({
				fields: snapshotOutputFields(fields, schema, path, context),
				kind: 'object',
				typeName: readOptionalString(
					Reflect.get(options, 'typeName'),
					`${displayPath}.typeName`,
				),
			})
		}
		default: {
			const reference = context.pluginValues.get(descriptor.kind)
			if (reference === undefined) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Virtual field ${displayPath} uses "${descriptor.kind}" without a configured typegen contribution`,
					{ path: displayPath },
				)
			}
			return immutableRecord({
				kind: 'plugin',
				reference: immutableRecord({
					exportName: reference.exportName,
					module: reference.module,
				}),
			})
		}
	}
}

const snapshotOutputFields = (
	fields: Readonly<Record<string, unknown>>,
	schema: SchemaDefinition,
	parentPath: readonly string[],
	context: VirtualSnapshotContext,
): readonly TypegenFieldSnapshot[] =>
	immutableArray(
		Object.entries(fields)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([name, candidate]) => {
				if (
					typeof candidate !== 'object' ||
					candidate === null ||
					!('kind' in candidate) ||
					!('options' in candidate)
				) {
					const invalidPath = `${schema.className}.${[...parentPath, name].join('.')}`
					throw new SchemaTypegenError(
						'unsupported-field-kind',
						`Virtual output ${invalidPath} is invalid`,
						{ path: invalidPath },
					)
				}
				const descriptor = candidate as GenericOutputDescriptor
				const path = immutableArray([...parentPath, name])
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
	context: VirtualSnapshotContext,
): readonly TypegenVirtualFieldSnapshot[] =>
	immutableArray(
		Object.entries(fields)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([name, field]) => {
				const [snapshot] = snapshotOutputFields(
					{ [name]: field.output },
					schema,
					[],
					context,
				)
				if (snapshot === undefined) {
					throw new SchemaTypegenError(
						'unsupported-field-kind',
						`Virtual field ${schema.className}.${name} has no output`,
						{ path: `${schema.className}.${name}` },
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
