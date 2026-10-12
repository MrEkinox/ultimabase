import {
	collectOperationFieldInputs,
	FrameworkError,
	protectedPolicy,
	readOperationResultSelection,
	type Principal,
	type ProtectedPolicyDefinition,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import { isACLChangeValue } from './acl-change.js'
import { aclFieldName, type ACLClientSharing } from './acl-option.js'
import { isAcceptedACLValue } from './acl-acceptance.js'

/** What the field policy reads from the ACL application state. */
export interface ACLFieldPolicyState {
	readonly protectedOption: (operation: RuntimeLogicalOperationAst) =>
		| Readonly<{
				config: Readonly<{ clientSharing: ACLClientSharing | undefined }>
				schema: SchemaDefinition
		  }>
		| undefined
	readonly resolvePrincipal: () => Promise<Principal | undefined>
}

const withoutACL = (
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([field]) => field !== aclFieldName),
		),
	)

/** Removes the protected ACL property while retaining result cardinality. */
const removeACL = <const TResult>(result: TResult): TResult => {
	const value: unknown = result
	if (isUnknownArray(value)) {
		return immutableArray(
			value.map((item) => (isPlainRecord(item) ? withoutACL(item) : item)),
		) as TResult
	}
	return (isPlainRecord(value) ? withoutACL(value) : result) as TResult
}

/** Refuses a selected ACL on any row `clientSharing` does not allow. */
const assertShareableRows = async (
	result: unknown,
	className: string,
	shareable: (acl: ACL) => Promise<boolean>,
): Promise<void> => {
	const rows = isUnknownArray(result) ? result : [result]
	for (const row of rows) {
		if (!isPlainRecord(row)) continue
		const acl: unknown = row[aclFieldName]
		if (acl instanceof ACL && (await shareable(acl))) continue
		throw new FrameworkError(
			'PERMISSION_DENIED',
			`select: { acl: true } on ${className} returned a row acl.clientSharing does not allow: select the acl only on rows the caller may share.`,
			{
				publicMessage: 'The operation is not permitted.',
				internalDetails: { kind: 'acl-select-not-shareable' },
			},
		)
	}
}

const selectsACL = (operation: RuntimeLogicalOperationAst): boolean =>
	readOperationResultSelection(operation).fields.some(
		({ field }) => field === aclFieldName,
	)

/**
 * Creates ACL's deny-only Core policy for the `acl` field: clients never
 * read, filter or write it, except `select: { acl: true }` and
 * `grant`/`revoke` on the rows `acl.clientSharing` allows (ADR-0321).
 */
export const createACLFieldPolicy = (
	state: ACLFieldPolicyState,
): ProtectedPolicyDefinition =>
	protectedPolicy({
		evaluate: ({ operation }) => {
			const option = state.protectedOption(operation)
			if (option === undefined) return undefined

			const selected = selectsACL(operation)
			if (selected && option.config.clientSharing === undefined) {
				// A denial, not an error, so an inclusion reads it as absence.
				return immutableRecord({
					allowed: false,
					reason: `select: { acl: true } on ${option.schema.className} requires useMasterKey: true, or acl.clientSharing for the rows it allows`,
				})
			}

			return immutableRecord({
				selectionFields: immutableArray(
					Object.entries(option.schema.fields)
						.filter(
							([field, definition]) =>
								(selected || field !== aclFieldName) &&
								definition.kind !== 'relation',
						)
						.map(([field]) => field),
				),
			})
		},
		master: 'bypass',
		preparedMutation: ({ operation }) => {
			const sharing = state.protectedOption(operation)?.config.clientSharing
			// `grant`/`revoke` are checked against the locked row by the ACL
			// interceptor; values it produced pass the second evaluation.
			return collectOperationFieldInputs(operation, 'parent-first').some(
				({ fieldPath, mode, value }) =>
					mode === 'update' &&
					fieldPath[0] === aclFieldName &&
					!isAcceptedACLValue(value) &&
					!(isACLChangeValue(value) && sharing !== undefined),
			)
				? false
				: undefined
		},
		restrictResult: async ({ operation, result }) => {
			const option = state.protectedOption(operation)
			if (option === undefined) return result
			const sharing = option.config.clientSharing
			if (sharing === undefined || !selectsACL(operation)) {
				return removeACL(result)
			}
			const principal = await state.resolvePrincipal()
			await assertShareableRows(result, option.schema.className, (currentAcl) =>
				Promise.resolve(sharing({ currentAcl, principal })),
			)
			return result
		},
	})
