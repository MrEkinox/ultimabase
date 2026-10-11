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
import { isAcceptedACLValue } from './acl-operation-resolution.js'

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

/** Keeps the ACL of the rows `keep` allows; removes it from the others. */
const restrictACLResult = async <const TResult>(
	result: TResult,
	keep: (acl: unknown) => Promise<boolean>,
): Promise<TResult> => {
	const restrict = async (item: unknown): Promise<unknown> =>
		isPlainRecord(item) &&
		Object.hasOwn(item, aclFieldName) &&
		!(await keep(item[aclFieldName]))
			? withoutACL(item)
			: item
	const value: unknown = result
	if (isUnknownArray(value)) {
		return immutableArray(
			await Promise.all(value.map((item) => restrict(item))),
		) as TResult
	}
	return (await restrict(value)) as TResult
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
				throw new FrameworkError(
					'PERMISSION_DENIED',
					`select: { acl: true } on ${option.schema.className} requires useMasterKey: true, or acl.clientSharing for the rows it allows.`,
					{
						publicMessage: 'The acl field cannot be selected.',
						internalDetails: { kind: 'acl-select-denied' },
					},
				)
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
				return restrictACLResult(result, () => Promise.resolve(false))
			}
			const principal = await state.resolvePrincipal()
			return restrictACLResult(
				result,
				async (currentAcl) =>
					currentAcl instanceof ACL &&
					(await sharing({ currentAcl, principal })),
			)
		},
	})
