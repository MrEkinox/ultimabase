import {
	booleanField,
	contributeDeclarations,
	plugin,
	providePersistencePlanRewriter,
	provideRuntimeConstraint,
	type PluginDeclarationContribution,
	type PluginInstance,
	type PluginModelSurfaceSource,
	type PluginSchemaOptionSource,
	type PluginSchemaPatchSource,
	type SchemaSelection,
	type SchemaSelectorOptions,
	type AddSchemaFieldOperation,
	type BooleanField,
	type ForbiddenMutationInputField,
	type ScalarFieldTypegenState,
} from '@ultimabase/core'
import {
	patchSchemas,
	schemaPatch,
	type SchemaPatchBuilder,
} from '@ultimabase/plugin-kit'

import type { SoftDeleteMode, SoftDeletePluginOptions } from './contracts.js'
import {
	normalizeSoftDeletePluginOptions,
	softDeleteSchemaOption,
} from './options.js'
import {
	createSoftDeleteVisibilityPolicy,
	softDeleteTombstoneContributionId,
	softDeleteTombstoneFieldName,
} from './visibility.js'
import { createSoftDeletePersistenceRewriter } from './replace-delete.js'
import {
	createExplicitSoftDeleteContribution,
	softDeleteMutation,
} from './explicit.js'
import {
	createSoftDeleteAdministrationContributions,
	purgeMutation,
	restoreMutation,
} from './administration.js'

const softDeletePluginPermissions = {
	'schema:declare': 'Declares the direct soft-delete schema option.',
	'runtime:constrain': 'Keeps tombstoned rows outside ordinary operations.',
	'persistence:rewrite':
		'Persists soft-delete effects as atomic tombstone updates.',
	'operation:declare': 'Declares soft-delete and administration mutations.',
	'model:extend': 'Adds soft-delete commands to enabled schema handles.',
	'transport:expose': 'Binds explicit soft delete to REST and GraphQL.',
	'typegen:reference':
		'Preserves payload-free soft-delete commands in Typegen.',
} as const

const tombstoneField: BooleanField<
	ScalarFieldTypegenState<true, false, false, true>
> = booleanField({ default: false, required: true })
const tombstonePatch: SchemaPatchBuilder<
	readonly [
		AddSchemaFieldOperation<
			typeof softDeleteTombstoneFieldName,
			ForbiddenMutationInputField<typeof tombstoneField>
		>,
	]
> = schemaPatch().addField({
	contributionId: softDeleteTombstoneContributionId,
	field: tombstoneField,
	mutationInput: 'forbidden',
	name: softDeleteTombstoneFieldName,
})

const explicitSoftDeleteSelector = {
	option: { equals: 'explicit', name: 'softDelete' },
	owner: { kind: 'application' },
} as const
const replaceSoftDeleteSelector = {
	option: { equals: 'replace-delete', name: 'softDelete' },
	owner: { kind: 'application' },
} as const
// One selector owns every inherited Runtime and source-typing branch.
const defaultSoftDeleteSelector = {
	option: { name: 'softDelete', present: false },
	owner: { kind: 'application' },
} as const

type ExplicitSoftDeleteSurface = Readonly<{
	contributionId: 'official-soft-delete-mutation'
	schemaMutations: Readonly<{
		softDelete: Readonly<{
			mutation: typeof softDeleteMutation
			surfaces: readonly ['schema', 'model']
		}>
	}>
}>

const explicitSoftDeleteSurface: ExplicitSoftDeleteSurface = {
	contributionId: 'official-soft-delete-mutation',
	schemaMutations: {
		softDelete: {
			mutation: softDeleteMutation,
			surfaces: ['schema', 'model'],
		},
	},
}

type SoftDeleteAdministrationSurface = Readonly<{
	contributionId: 'official-soft-delete-administration'
	schemaMutations: Readonly<{
		restore: Readonly<{
			mutation: typeof restoreMutation
			surfaces: readonly ['schema']
		}>
		purge: Readonly<{
			mutation: typeof purgeMutation
			surfaces: readonly ['schema']
		}>
	}>
}>

const softDeleteAdministrationSurface: SoftDeleteAdministrationSurface = {
	contributionId: 'official-soft-delete-administration',
	schemaMutations: {
		restore: {
			mutation: restoreMutation,
			surfaces: ['schema'],
		},
		purge: {
			mutation: purgeMutation,
			surfaces: ['schema'],
		},
	},
}
type SoftDeleteOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-soft-delete-schema-option'
	readonly schema: Readonly<{
		softDelete: typeof softDeleteSchemaOption
	}>
}>
// Each source projects the tombstone field or one mutation surface onto the
// schemas matched by one selector.
type TombstoneSource<TSelector extends SchemaSelectorOptions> =
	PluginSchemaPatchSource<
		typeof tombstonePatch.operations,
		SchemaSelection<TSelector>
	>
type SurfaceSource<
	TSelector,
	TSurface extends ExplicitSoftDeleteSurface | SoftDeleteAdministrationSurface,
> = PluginModelSurfaceSource<TSelector, TSurface['schemaMutations']>

type ExplicitSelector = typeof explicitSoftDeleteSelector
type ReplaceSelector = typeof replaceSoftDeleteSelector
type DefaultSelector = typeof defaultSoftDeleteSelector

type ExplicitSoftDeleteSource =
	| SoftDeleteOptionSource
	| TombstoneSource<ExplicitSelector>
	| TombstoneSource<ReplaceSelector>
	| SurfaceSource<ExplicitSelector, ExplicitSoftDeleteSurface>
	| SurfaceSource<ExplicitSelector, SoftDeleteAdministrationSurface>
	| SurfaceSource<ReplaceSelector, SoftDeleteAdministrationSurface>

// Widened modes expose only commands guaranteed for every possible default.
type SoftDeleteSource<TMode extends SoftDeleteMode> =
	| ExplicitSoftDeleteSource
	| ([TMode] extends ['explicit' | 'replace-delete']
			? | TombstoneSource<DefaultSelector>
				| SurfaceSource<DefaultSelector, SoftDeleteAdministrationSurface>
			: never)
	| ([TMode] extends ['explicit']
			? SurfaceSource<DefaultSelector, ExplicitSoftDeleteSurface>
			: never)

const createSoftDeleteDeclarations = (
	normalized: ReturnType<typeof normalizeSoftDeletePluginOptions>,
): PluginDeclarationContribution<readonly [], ExplicitSoftDeleteSource> =>
	contributeDeclarations({
		schema: ({ schemas }) => {
			const options = schemas.defineOptions({
				contributionId: 'official-soft-delete-schema-option',
				schema: { softDelete: softDeleteSchemaOption },
				staticOptions: { defaultMode: normalized.defaultMode },
			})
			const explicitField = schemas.patch(
				patchSchemas({
					patch: tombstonePatch,
					targets: schemas.select(explicitSoftDeleteSelector),
				}),
			)
			const replaceField = schemas.patch(
				patchSchemas({
					patch: tombstonePatch,
					targets: schemas.select(replaceSoftDeleteSelector),
				}),
			)
			if (normalized.defaultMode !== 'disabled') {
				// The implicit-default projection remains owned by issue 6309 because
				// its source type depends on the exact plugin factory argument.
				schemas.patch(
					patchSchemas({
						patch: tombstonePatch,
						staticOptions: { defaultMode: normalized.defaultMode },
						targets: schemas.select(defaultSoftDeleteSelector),
					}),
				)
			}
			return [options, explicitField, replaceField] as const
		},
		models: ({ models }) => {
			const explicitMutation = models.extend(
				explicitSoftDeleteSelector,
				explicitSoftDeleteSurface,
			)
			if (normalized.defaultMode === 'explicit') {
				models.extend(defaultSoftDeleteSelector, {
					...explicitSoftDeleteSurface,
					contributionId: 'official-soft-delete-default-mutation',
					staticOptions: { defaultMode: normalized.defaultMode },
				})
			}

			const explicitAdministration = models.extend(explicitSoftDeleteSelector, {
				...softDeleteAdministrationSurface,
				contributionId: 'official-soft-delete-explicit-administration',
			})
			const replaceAdministration = models.extend(replaceSoftDeleteSelector, {
				...softDeleteAdministrationSurface,
				contributionId: 'official-soft-delete-replace-delete-administration',
			})
			if (normalized.defaultMode !== 'disabled') {
				models.extend(defaultSoftDeleteSelector, {
					...softDeleteAdministrationSurface,
					contributionId: 'official-soft-delete-default-administration',
					staticOptions: { defaultMode: normalized.defaultMode },
				})
			}
			return [
				explicitMutation,
				explicitAdministration,
				replaceAdministration,
			] as const
		},
	})

/** Names one configured official soft-delete plugin. */
export type SoftDeletePlugin<TMode extends SoftDeleteMode = SoftDeleteMode> =
	PluginInstance<{
		readonly id: '@ultimabase/soft-delete-plugin'
		readonly instanceId: string | undefined
		readonly version: '0.0.0'
		readonly core: '^0.0.0'
		readonly source: SoftDeleteSource<TMode>
	}>

/**
 * Installs the official soft-delete schema contract explicitly.
 *
 * Importing the package alone changes nothing. An omitted `defaultMode` is
 * `disabled`, while a direct schema option may enable either supported mode.
 *
 * @example
 * ```ts
 * softDeletePlugin({ defaultMode: 'disabled' })
 * ```
 */
export const softDeletePlugin = <
	const TMode extends SoftDeleteMode = 'disabled',
>(
	options: SoftDeletePluginOptions & { readonly defaultMode?: TMode } = {},
): SoftDeletePlugin<TMode> => {
	const normalized = normalizeSoftDeletePluginOptions(options)

	// The parser validates the same mode captured by TMode before Core receives
	// this immutable definition; no default surface is added at Runtime by typing.
	return plugin({
		id: '@ultimabase/soft-delete-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		...(normalized.instanceId === undefined
			? {}
			: { instanceId: normalized.instanceId }),
		permissions: softDeletePluginPermissions,
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'official-soft-delete-visibility',
				create: ({ owner, schemas }) => ({
					value: createSoftDeleteVisibilityPolicy(schemas, owner),
				}),
			}),
			providePersistencePlanRewriter({
				contributionId: 'official-soft-delete-replace-delete',
				create: ({ owner, schemas }) => ({
					value: createSoftDeletePersistenceRewriter(
						schemas,
						owner,
						normalized.defaultMode,
					),
				}),
			}),
			createExplicitSoftDeleteContribution(),
			...createSoftDeleteAdministrationContributions(),
			createSoftDeleteDeclarations(normalized),
		],
	})
}
