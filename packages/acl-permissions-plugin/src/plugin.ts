import {
	accessPrincipalResolverServiceToken,
	definePlugin,
	extensionHandlerKey,
	resolveAccessPrincipal,
	type ExecutableOperationAst,
	type FrameworkPlugin,
	type HookContext,
	type PointerValue,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	acl,
	aclFieldName,
	aclPluginName,
	aclSchemaExtensionName,
	type ACLSchemaExtensionConfig,
} from './acl-extension.js'

type ACLCreateOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

/** Exposes ACL-enabled schemas discovered in one application. */
export interface ACLPluginExports {
	readonly schemas: readonly SchemaDefinition[]
}

/** Represents the zero-option ACL provider before entry limits are added by issue 428. */
export type ACLPlugin = FrameworkPlugin<
	typeof aclPluginName,
	ACLPluginExports,
	undefined,
	undefined,
	undefined,
	undefined,
	never
>

const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

/** Removes the reserved ACL value before schema-local callbacks observe row data. */
const omitACL = (
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => fieldName !== aclFieldName),
		),
	)

const resolveDefaultACL = async (
	config: ACLSchemaExtensionConfig,
	data: Readonly<Record<string, unknown>>,
	principal: PointerValue | undefined,
	context: HookContext,
): Promise<ACL> => {
	const declaredDefault = config.default
	const value =
		typeof declaredDefault === 'function'
			? await declaredDefault({ context, data, principal })
			: declaredDefault

	return snapshotResolvedACL(value, 'acl default')
}

const resolveCreateInputACL = async (
	input: Readonly<Record<string, unknown>>,
	config: ACLSchemaExtensionConfig,
	principal: PointerValue | undefined,
	context: HookContext,
): Promise<Readonly<Record<string, unknown>>> => {
	const data = omitACL(input)
	const explicitACL = Object.hasOwn(input, aclFieldName)
		? snapshotResolvedACL(input[aclFieldName], 'acl input')
		: undefined

	if (explicitACL !== undefined && config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires acl({ resolveInput }) configuration',
		)
	}

	const resolvedInput = await config.resolveInput?.({
		context,
		currentAcl: undefined,
		data,
		inputAcl: explicitACL,
		operation: 'create',
		principal,
	})
	const resolvedACL =
		resolvedInput === undefined
			? await resolveDefaultACL(config, data, principal, context)
			: snapshotResolvedACL(resolvedInput, 'acl resolveInput')

	return immutableRecord({ ...input, [aclFieldName]: resolvedACL })
}

/** Applies one schema extension to every create candidate without merging bulk items. */
/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
>(
	operation: TOperation,
	config: ACLSchemaExtensionConfig,
	principal: PointerValue | undefined,
	context: HookContext,
): Promise<TOperation> => {
	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolveCreateInputACL(
					operation.input,
					config,
					principal,
					context,
				),
			}) as unknown as TOperation
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(
						operation.inputs.map((input) =>
							resolveCreateInputACL(input, config, principal, context),
						),
					),
				),
			}) as unknown as TOperation
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolveCreateInputACL(
					operation.create,
					config,
					principal,
					context,
				),
			}) as unknown as TOperation
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({
								...item,
								create: await resolveCreateInputACL(
									item.create,
									config,
									principal,
									context,
								),
							}),
						),
					),
				),
			}) as unknown as TOperation
	}
}

const aclExtensionTarget = acl()

/**
 * Activates ACL defaults and native Access behavior for schemas using `acl()`.
 *
 * The plugin discovers compatible identity providers through neutral Core
 * services; applications without authentication remain valid.
 */
export const aclPlugin = (): ACLPlugin =>
	definePlugin({
		name: aclPluginName,
		setup: ({ hooks, registries, schemas, services }) => {
			registries.extensions.register(
				extensionHandlerKey('schema', aclSchemaExtensionName),
				true,
			)
			const resolvePrincipal = (context: HookContext) =>
				resolveAccessPrincipal({
					context,
					ownsSchema: (schema) => schemas.get(schema.className) === schema,
					resolver: services.getOptional(
						accessPrincipalResolverServiceToken,
					),
				})

			hooks.schemaExtension(
				'resolve-create-input',
				aclExtensionTarget,
				({ extension }) => ({
					resolveInput: {
						create: async ({ context, operation }) => {
							const principal = await resolvePrincipal(context)

							return resolveCreateOperationACL(
								operation,
								extension.config,
								principal,
								context,
							)
						},
						upsert: async ({ context, operation }) => {
							const principal = await resolvePrincipal(context)

							return resolveCreateOperationACL(
								operation,
								extension.config,
								principal,
								context,
							)
						},
					},
				}),
			)

			const protectedSchemas = schemas.values().filter((schema) =>
				schema.extensions.some(
					(extension) => extension.name === aclSchemaExtensionName,
				),
			)

			return Object.freeze({ schemas: Object.freeze(protectedSchemas) })
		},
	})
