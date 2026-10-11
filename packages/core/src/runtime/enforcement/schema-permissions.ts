import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { readApplicationRuntimeKernelState } from '../../application/application-kernel-state.js'
import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactory,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	getRequestContextOwner,
	type RequestContext,
} from '../context/request-context.js'
import type { ProtectedPolicyImplementation } from './protected-policy.js'

/**
 * One named permission a plugin declares for one schema (ADR-0317), such as
 * Soft Delete's `readDeleted`. Policies grant it; Core never names it.
 */
export interface SchemaPermissionDeclaration {
	/** The permission name: a JavaScript identifier, for example `readDeleted`. */
	readonly permission: string
	/** The application schema the permission applies to. */
	readonly schema: SchemaDefinition
}

/** Collects the schema permissions every installed plugin declares. */
export const schemaPermissionsCapability: CapabilityToken<
	readonly SchemaPermissionDeclaration[],
	readonly SchemaPermissionDeclaration[],
	'ultimabase.schema-permissions',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	readonly SchemaPermissionDeclaration[],
	readonly SchemaPermissionDeclaration[]
>()({
	capabilityId: 'ultimabase.schema-permissions',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) => immutableArray(providers.flat()),
})

const permissionNamePattern = /^[A-Za-z_$][\w$]*$/u

const normalizeDeclarations = (
	value: unknown,
	ownsSchema: (schema: SchemaDefinition) => boolean,
): readonly SchemaPermissionDeclaration[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError('schema permissions must be an array')
	}
	const seen = new Set<string>()
	return immutableArray(
		value.map((declaration) => {
			if (
				!isPlainRecord(declaration) ||
				typeof declaration.permission !== 'string' ||
				!permissionNamePattern.test(declaration.permission) ||
				!Schema.is(declaration.schema)
			) {
				throw new TypeError(
					'schema permission must name an identifier and a schema',
				)
			}
			const { permission, schema } = declaration
			if (!ownsSchema(schema)) {
				throw new TypeError(
					`Permission ${permission} targets a schema outside its application`,
				)
			}
			const key = `${schema.className}\u0000${permission}`
			if (seen.has(key)) {
				throw new TypeError(
					`Permission ${permission} is declared twice for ${schema.className}`,
				)
			}
			seen.add(key)
			return immutableRecord({ permission, schema })
		}),
	)
}

/** Options of {@link provideSchemaPermissions}. */
export interface SchemaPermissionsProviderOptions {
	/** Stable owner-local identity used in diagnostics. */
	readonly contributionId: string
	/** Lists the permissions of this plugin, once the application compiled. */
	readonly create: ApplicationCapabilityFactory<
		readonly SchemaPermissionDeclaration[]
	>
}

/**
 * Declares named schema permissions that policies may grant (ADR-0317). The
 * declaring plugin asks for one during a request with
 * {@link holdsSchemaPermission}.
 *
 * @example
 * ```ts
 * provideSchemaPermissions({
 *   contributionId: 'permissions',
 *   create: ({ schemas }) => ({
 *     value: schemas.values().map((schema) => ({ permission: 'readArchived', schema })),
 *   }),
 * })
 * ```
 */
export const provideSchemaPermissions = (
	options: SchemaPermissionsProviderOptions,
): CapabilityProviderDeclaration<typeof schemaPermissionsCapability> => {
	if (!isPlainRecord(options) || typeof options.create !== 'function') {
		throw new TypeError('schema permissions provider requires create()')
	}
	const { contributionId, create } = options
	return provideCapability(schemaPermissionsCapability, {
		contributionId,
		create: async (context) => {
			const resource = await create(context)
			return immutableRecord({
				...resource,
				value: normalizeDeclarations(
					resource.value,
					(schema) => context.schemas.get(schema.className) === schema,
				),
			})
		},
	})
}

/** Protected policies of each application, bound when enforcement is assembled. */
const permissionPolicies = new WeakMap<
	object,
	readonly ProtectedPolicyImplementation[]
>()

/** @internal Binds the policies Core asks about schema permissions. */
export const bindSchemaPermissionPolicies = (
	application: object,
	policies: readonly ProtectedPolicyImplementation[],
): void => {
	permissionPolicies.set(
		application,
		immutableArray(
			policies.filter(({ permission }) => permission !== undefined),
		),
	)
}

/**
 * Tells whether the caller of one request holds a declared schema permission
 * (ADR-0317). Master always holds it. Otherwise Core asks every installed
 * policy: the permission is held when at least one grants it and none refuses
 * it, so it is refused when no policy answers.
 *
 * @example `const seesDeleted = await holdsSchemaPermission(context, schema, 'readDeleted')`
 */
export const holdsSchemaPermission = async (
	context: RequestContext,
	schema: SchemaDefinition,
	permission: string,
): Promise<boolean> => {
	const application = getRequestContextOwner(context)
	if (application === undefined) {
		throw new TypeError('Schema permissions require an application request')
	}
	const declared = readApplicationRuntimeKernelState(application)
		.capabilityContributions(schemaPermissionsCapability)
		.some(({ value }) =>
			value.some(
				(entry) => entry.schema === schema && entry.permission === permission,
			),
		)
	if (!declared) {
		throw new TypeError(
			`Permission ${permission} is not declared for ${schema.className}`,
		)
	}
	if (context.access.mode === 'master') return true

	const input = immutableRecord({ context, permission, schema })
	let granted = false
	for (const policy of permissionPolicies.get(application) ?? []) {
		if (policy.schema !== undefined && policy.schema !== schema) continue
		const answer: unknown = await policy.permission?.(input)
		if (answer === false) return false
		if (answer === true) granted = true
		else if (answer !== undefined) {
			throw new TypeError('A permission answer must be a boolean or undefined')
		}
	}
	return granted
}
