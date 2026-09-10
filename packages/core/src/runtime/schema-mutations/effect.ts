import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import type { UpdateExpressionNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { snapshotDeclaredFieldValue } from '../../schema/fields/base/definition.js'

export interface ValidatedSchemaMutationEffect {
	readonly current: Readonly<Record<string, unknown>> | null
	readonly effect:
		| Readonly<{ readonly kind: 'delete' }>
		| Readonly<{
				readonly kind: 'update'
				readonly update: UpdateExpressionNode
		  }>
}

const invalidEffect = (
	command: CompiledSchemaMutationCommand,
	message: string,
	field?: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		publicMessage: 'The requested operation could not be completed.',
		internalDetails: {
			kind: 'schema-mutation-effect-invalid',
			operation: command.mutation.name,
			...(field === undefined ? {} : { field }),
		},
	})

const isOwnedField = (
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	field: string,
): boolean => {
	const provenance = schema.provenance.fields[field]?.owner

	return (
		provenance?.kind === 'plugin' &&
		provenance.pluginId === command.owner.pluginId &&
		provenance.instanceId === command.owner.instanceId
	)
}

/** Validates the resolver result before Core creates any physical statement. */
export const validateSchemaMutationEffect = (
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	originalItem: Readonly<Record<string, unknown>>,
	candidate: unknown,
): ValidatedSchemaMutationEffect => {
	if (command.mutation.effect === 'delete') {
		if (candidate !== undefined) {
			throw invalidEffect(
				command,
				`Delete schema mutation ${command.mutation.name} must return undefined.`,
			)
		}

		return immutableRecord({
			current: null,
			effect: immutableRecord({ kind: 'delete' as const }),
		})
	}

	if (
		!isPlainRecord(candidate) ||
		Object.keys(candidate).length !== 1 ||
		!Object.hasOwn(candidate, 'data') ||
		!isPlainRecord(candidate.data) ||
		Object.keys(candidate.data).length === 0
	) {
		throw invalidEffect(
			command,
			`Update schema mutation ${command.mutation.name} must return one non-empty data object.`,
		)
	}

	const current: Record<string, unknown> = { ...originalItem }
	const operations: Readonly<{
		readonly field: string
		readonly kind: 'set'
		readonly value: unknown
	}>[] = Object.entries(candidate.data).map(([fieldName, value]) => {
		const field = schema.persistedFields[fieldName]
		if (
			field === undefined ||
			field.kind === 'pointer' ||
			field.kind === 'relation' ||
			('system' in field.options && field.options.system === true) ||
			!isOwnedField(command, schema, fieldName)
		) {
			throw invalidEffect(
				command,
				`Schema mutation ${command.mutation.name} cannot replace field ${fieldName}.`,
				fieldName,
			)
		}
		if (value === undefined) {
			throw invalidEffect(
				command,
				`Schema mutation ${command.mutation.name} cannot replace field ${fieldName} with undefined.`,
				fieldName,
			)
		}
		let snapshot: unknown
		try {
			snapshot = snapshotDeclaredFieldValue(
				field,
				value,
				`${command.mutation.name}.data.${fieldName}`,
			)
		} catch (cause: unknown) {
			throw new FrameworkError(
				'PLUGIN_OPERATION_INVALID',
				`Schema mutation ${command.mutation.name} returned an invalid value for ${fieldName}.`,
				{
					cause,
					publicMessage: 'The requested operation could not be completed.',
					internalDetails: {
						field: fieldName,
						kind: 'schema-mutation-effect-invalid',
						operation: command.mutation.name,
					},
				},
			)
		}
		current[fieldName] = snapshot
		return immutableRecord({
			field: fieldName,
			kind: 'set' as const,
			value: snapshot,
		})
	})
	const update: UpdateExpressionNode = immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})

	return immutableRecord({
		current: immutableRecord(current),
		effect: immutableRecord({ kind: 'update' as const, update }),
	})
}
