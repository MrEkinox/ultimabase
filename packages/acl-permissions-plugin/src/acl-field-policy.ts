import {
	collectOperationFieldInputs,
	protectedPolicy,
	readOperationResultSelection,
	type ProtectedPolicyDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { aclFieldName } from './acl-option.js'
import { readOperationSchema } from './runtime-operation.js'

const restrictACLRecord = (
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([field]) => field !== aclFieldName),
		),
	)

/** Removes only the protected ACL property while retaining result cardinality. */
const restrictACLResult = <const TResult>(result: TResult): TResult => {
	const value: unknown = result
	if (isUnknownArray(value)) {
		return immutableArray(
			value.map((item) =>
				isPlainRecord(item) ? restrictACLRecord(item) : item,
			),
		) as TResult
	}
	return (isPlainRecord(value) ? restrictACLRecord(value) : result) as TResult
}

/** Creates ACL's independent deny-only Core policy without an Access dependency. */
export const createACLFieldPolicy = (
	protectedSchemas: ReadonlySet<SchemaDefinition>,
): ProtectedPolicyDefinition =>
	protectedPolicy({
		evaluate: ({ operation }) => {
			const schema = readOperationSchema(operation)
			if (!protectedSchemas.has(schema)) return undefined

			const selected = readOperationResultSelection(operation).fields
			if (selected.some(({ field }) => field === aclFieldName)) {
				return immutableRecord({ allowed: false as const })
			}

			return immutableRecord({
				selectionFields: immutableArray(
					Object.entries(schema.fields)
						.filter(
							([field, definition]) =>
								field !== aclFieldName && definition.kind !== 'relation',
						)
						.map(([field]) => field),
				),
			})
		},
		master: 'bypass',
		preparedMutation: ({ operation }) =>
			collectOperationFieldInputs(operation, 'parent-first').some(
				({ fieldPath, mode }) =>
					mode === 'update' && fieldPath[0] === aclFieldName,
			)
				? false
				: undefined,
		restrictResult: ({ operation, result }) =>
			protectedSchemas.has(readOperationSchema(operation))
				? restrictACLResult(result)
				: result,
	})
