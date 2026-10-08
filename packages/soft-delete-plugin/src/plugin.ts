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
type ExplicitSoftDeleteFieldSource = PluginSchemaPatchSource<
	typeof tombstonePatch.operations,
	SchemaSelection<typeof explicitSoftDeleteSelector>
>
type ReplaceSoftDeleteFieldSource = PluginSchemaPatchSource<
	typeof tombstonePatch.operations,
	SchemaSelection<typeof replaceSoftDeleteSelector>
>
type ExplicitSoftDeleteMutationSource = PluginModelSurfaceSource<
	typeof explicitSoftDeleteSelector,
	typeof explicitSoftDeleteSurface.schemaMutations
>
type ExplicitSoftDeleteAdministrationSource = PluginModelSurfaceSource<
	typeof explicitSoftDeleteSelector,
	typeof softDeleteAdministrationSurface.schemaMutations
>
type ReplaceSoftDeleteAdministrationSource = PluginModelSurfaceSource<
	typeof replaceSoftDeleteSelector,
	typeof softDeleteAdministrationSurface.schemaMutations
>
type ExplicitSoftDeleteSource =
	| SoftDeleteOptionSource
	| ExplicitSoftDeleteFieldSource
	| ReplaceSoftDeleteFieldSource
	| ExplicitSoftDeleteMutationSource
	| ExplicitSoftDeleteAdministrationSource
	| ReplaceSoftDeleteAdministrationSource

type DefaultSoftDeleteFieldSource = PluginSchemaPatchSource<
	typeof tombstonePatch.operations,
	SchemaSelection<typeof defaultSoftDeleteSelector>
>
type DefaultSoftDeleteMutationSource = PluginModelSurfaceSource<
	typeof defaultSoftDeleteSelector,
	typeof explicitSoftDeleteSurface.schemaMutations
>
type DefaultSoftDeleteAdministrationSource = PluginModelSurfaceSource<
	typeof defaultSoftDeleteSelector,
	typeof softDeleteAdministrationSurface.schemaMutations
>
// Widened modes expose only commands guaranteed for every possible default.
type SoftDeleteSource<TMode extends SoftDeleteMode> =
	| ExplicitSoftDeleteSource
	| ([TMode] extends ['explicit' | 'replace-delete']
			? DefaultSoftDeleteFieldSource | DefaultSoftDeleteAdministrationSource
			: never)
	| ([TMode] extends ['explicit'] ? DefaultSoftDeleteMutationSource : never)

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
	const visibilityProvider = provideRuntimeConstraint({
		contributionId: 'official-soft-delete-visibility',
		create: ({ owner, schemas }) => ({
			value: createSoftDeleteVisibilityPolicy(schemas, owner),
		}),
	})
	const replaceDeleteProvider = providePersistencePlanRewriter({
		contributionId: 'official-soft-delete-replace-delete',
		create: ({ owner, schemas }) => ({
			value: createSoftDeletePersistenceRewriter(
				schemas,
				owner,
				normalized.defaultMode,
			),
		}),
	})
	const explicitContribution = createExplicitSoftDeleteContribution()
	const administrationContributions =
		createSoftDeleteAdministrationContributions()
	const declarations = createSoftDeleteDeclarations(normalized)

	// The parser validates the same mode captured by TMode before Core receives
	// this immutable definition; no default surface is added at Runtime by typing.
	return plugin({
		id: '@ultimabase/soft-delete-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		...(normalized.instanceId === undefined
			? {}
			: { instanceId: normalized.instanceId }),
		contributions: [
			visibilityProvider,
			replaceDeleteProvider,
			explicitContribution,
			...administrationContributions,
			declarations,
		],
	})
}
