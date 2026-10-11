import {
	booleanField,
	dateTimeField,
	providePersistencePlanRewriter,
	provideRuntimeConstraint,
	type BooleanField,
	type DateTimeField,
	type ScalarFieldTypegenState,
} from '@ultimabase/core'
import {
	command,
	definePlugin,
	shapeMethod,
	type CommandDefinition,
	type DefinedPlugin,
	type ShapeMethodDefinition,
} from '@ultimabase/plugin-kit'

import { parseSoftDeleteOptions, type SoftDeleteOptions } from './options.js'
import {
	createSoftDeletePersistenceRewriter,
	restoredValues,
	softDeletedValues,
} from './replace-delete.js'
import { createSoftDeleteVisibilityPolicy } from './visibility.js'

/** Fields `.softDelete()` adds; both are written by the server only. */
export type SoftDeleteFields = Readonly<{
	/** True while the row is soft-deleted; the protected filter reads it. */
	isDeleted: BooleanField<ScalarFieldTypegenState<true, false, false, true>>
	/** When the row was soft-deleted; `null` once restored. */
	deletedAt: DateTimeField<ScalarFieldTypegenState<false, false, false, false>>
}>

/** Commands `.softDelete()` adds, in both modes. */
export type SoftDeleteCommands = Readonly<{
	/** Hides one row (request authority: Access rule `softDeleteOne`). */
	softDeleteOne: CommandDefinition<'request', 'update', 'one'>
	/** Hides every visible row matching `where` (Access rule `softDeleteMany`). */
	softDeleteMany: CommandDefinition<'request', 'update', 'many'>
	/** Brings one hidden row back (Access rule `restoreOne`, closed by default). */
	restoreOne: CommandDefinition<'request', 'update', 'one'>
	/** Brings back every hidden row matching `where` (Access rule `restoreMany`). */
	restoreMany: CommandDefinition<'request', 'update', 'many'>
	/** Deletes one hidden row for good (Master only). */
	purgeOne: CommandDefinition<'master', 'delete', 'one'>
	/** Deletes every hidden row matching `where` for good (Master only). */
	purgeMany: CommandDefinition<'master', 'delete', 'many'>
}>

/** The `.softDelete(...)` shape method. */
export type SoftDeleteShape = Readonly<{
	/**
	 * Soft-deletes this schema's rows: adds `isDeleted` and `deletedAt`, hides
	 * deleted rows from every read and write, and adds the `softDeleteOne/Many`,
	 * `restoreOne/Many` and `purgeOne/Many` commands and the `readDeleted`
	 * permission (ordinary reads then see deleted rows). Without options,
	 * `deleteOne` and `deleteMany` soft-delete too; `{ mode: 'command' }` keeps
	 * them physical. Call it before `.with(...)`.
	 * @example `App.Schema.define({ className: 'Todo', fields }).softDelete().with({})`
	 */
	softDelete: ShapeMethodDefinition<
		SoftDeleteOptions,
		SoftDeleteFields,
		SoftDeleteCommands,
		readonly ['readDeleted']
	>
}>

/** The configured Soft Delete plugin. */
export type SoftDeletePlugin = DefinedPlugin<
	'@ultimabase/soft-delete-plugin',
	SoftDeleteShape,
	Readonly<Record<never, never>>
>

const fields: SoftDeleteFields = {
	isDeleted: booleanField({ default: false, required: true }),
	deletedAt: dateTimeField(),
}

const commands: SoftDeleteCommands = {
	softDeleteOne: command({
		authority: 'request',
		effect: 'update',
		// The row is readable before the command hides it (ADR-0306).
		checkReadable: 'before',
		data: softDeletedValues,
	}),
	softDeleteMany: command({
		authority: 'request',
		effect: 'update',
		checkReadable: 'before',
		data: softDeletedValues,
		target: 'many',
	}),
	restoreOne: command({
		authority: 'request',
		effect: 'update',
		data: restoredValues,
	}),
	restoreMany: command({
		authority: 'request',
		effect: 'update',
		data: restoredValues,
		target: 'many',
	}),
	purgeOne: command({ authority: 'master', effect: 'delete' }),
	purgeMany: command({ authority: 'master', effect: 'delete', target: 'many' }),
}

const shape: SoftDeleteShape = {
	softDelete: shapeMethod({
		options: parseSoftDeleteOptions,
		fields,
		commands,
		permissions: ['readDeleted'],
	}),
}

/**
 * Installs Soft Delete. Importing the package alone changes nothing; each
 * schema opts in with `.softDelete()`.
 *
 * @example
 * ```ts
 * const App = UltimaBase.use(softDeletePlugin())
 * const Todo = App.Schema.define({ className: 'Todo', fields }).softDelete().with({})
 * await Todo.deleteOne({ where: { id } }) // sets isDeleted and deletedAt
 * await Todo.restoreOne({ id })
 * ```
 */
export const softDeletePlugin = (): SoftDeletePlugin =>
	definePlugin({
		name: '@ultimabase/soft-delete-plugin',
		shape,
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'visibility',
				create: ({ owner, schemas }) => ({
					value: createSoftDeleteVisibilityPolicy(schemas, owner),
				}),
			}),
			providePersistencePlanRewriter({
				contributionId: 'delete',
				create: ({ owner, schemas }) => ({
					value: createSoftDeletePersistenceRewriter(schemas, owner),
				}),
			}),
		],
	})
