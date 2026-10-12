import {
	type ExecutableOperationAst as ExecutableAst,
	type Principal,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACL } from './acl.js'

import {
	acceptACL,
	assertMasterACLManagement,
	projectACLData,
	snapshotResolvedACL,
	type ACLAcceptance,
	type PersistentRoleResolver,
} from './acl-acceptance.js'
import {
	defaultACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import { aclFieldName, type NormalizedACLSchemaOption } from './acl-option.js'

export type ACLCreateOperation = Extract<
	ExecutableAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

/** Groups the request facts shared by every ACL value resolved in one operation. */
interface ACLResolution<
	TData extends Readonly<Record<string, unknown>>,
> extends ACLAcceptance {
	readonly config: NormalizedACLSchemaOption<TData>
	readonly principal: Principal | undefined
}

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
	resolution: ACLResolution<TData>,
): Promise<Readonly<Record<string, unknown>>> => {
	const { config, context, principal } = resolution
	// The schema-targeted hook guarantees this extension's declared developer-data shape.
	const data = projectACLData(schema, input) as TData
	let acl: ACL
	if (Object.hasOwn(input, aclFieldName)) {
		// Master writes an explicit ACL as is; `resolveInput` is not called.
		assertMasterACLManagement(context)
		acl = await acceptACL(
			snapshotResolvedACL(input[aclFieldName], 'acl input'),
			'acl input',
			resolution,
		)
	} else {
		const resolved = await config.resolveInput?.({
			context,
			currentAcl: undefined,
			currentData: undefined,
			data,
			operation: 'create',
			principal,
			update: undefined,
		})
		acl =
			resolved !== undefined
				? await acceptACL(resolved, 'acl resolveInput', resolution)
				: await acceptACL(
						typeof config.default === 'function'
							? await config.default({ context, data, principal })
							: config.default,
						'acl default',
						resolution,
					)
	}

	return immutableRecord({ ...input, [aclFieldName]: acl })
}

/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	config: NormalizedACLSchemaOption<TData>,
	principal: Principal | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	const resolution = {
		config,
		context,
		limits,
		principal,
		resolvePersistentRole,
		roleResolutionAvailable,
	}
	const schema =
		operation.kind === 'upsert-one'
			? operation.query.schema.definition
			: operation.schema.definition
	const resolve = (
		input: Readonly<Record<string, unknown>>,
	): Promise<Readonly<Record<string, unknown>>> =>
		resolveCreateInputACL(schema, input, resolution)

	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolve(operation.input),
			})
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(operation.inputs.map((input) => resolve(input))),
				),
			})
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolve(operation.create),
			})
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({ ...item, create: await resolve(item.create) }),
						),
					),
				),
			})
	}
}
