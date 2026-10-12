import {
	UltimaBase,
	dateTimeField,
	type CompiledApplication,
	type FieldBuilder,
} from '@ultimabase/core'
import { readSchemaRules } from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { command, definePlugin, shapeMethod } from '../index.js'

const isBoolean = (value: unknown, path: string): boolean => {
	if (typeof value !== 'boolean')
		throw new TypeError(`${path} must be a boolean`)
	return value
}

const archivePlugin = () =>
	definePlugin({
		name: '@community/archive',
		version: '1.2.0',
		shape: {
			archivable: shapeMethod({
				options: (value, path) => {
					if (typeof value !== 'object' || value === null) {
						throw new TypeError(`${path} must be an object`)
					}
					return { reason: Reflect.get(value, 'reason') === true }
				},
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: '2026-10-11T00:00:00.000Z' }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						target: 'many',
					}),
					purgeOne: command({ authority: 'master', effect: 'delete' }),
				},
			}),
		},
		rules: { audit: isBoolean },
	})

const surface = (application: CompiledApplication, className: string) =>
	application.schemaSurfaces.find(
		({ schema }) => schema.className === className,
	)

describe('definePlugin', () => {
	it('derives the manifest and privileges from what the plugin declares', () => {
		const instance = archivePlugin()

		expect(instance.manifest).toMatchObject({
			core: '^0.0.0',
			identity: { pluginId: '@community/archive' },
			version: '1.2.0',
		})
		expect(instance.manifest.privileges.map(({ name }) => name)).toEqual([
			'schema:declare',
			'model:extend',
			'operation:declare',
			// No transport binding: transports expose commands by rule (ADR-0325).
			'persistence:rewrite',
		])
		expect(
			definePlugin({ name: 'community.empty' }).manifest.privileges,
		).toEqual([])
		expect(definePlugin({ name: 'community.empty' }).manifest.version).toBe(
			'0.0.0',
		)
	})

	it('adds fields, commands and validated rules to the schemas that opt in', () => {
		const App = UltimaBase.use(archivePlugin())
		const Archived = App.Schema.define({
			className: 'FacadeArchived',
			fields: (field) => ({ title: field.string() }),
		})
			.archivable({ reason: true })
			.with({ audit: true })
		const Plain = App.Schema.define({
			className: 'FacadePlain',
			fields: (field) => ({ title: field.string() }),
		}).with({})
		const compiled = new App({
			logger: false,
			schemas: [Archived, Plain],
		}).compile()
		const archived = compiled.schemas.get(Archived.className)
		if (archived === undefined) throw new TypeError('Missing schema')

		expect(archived.persistedFields.archivedAt).toMatchObject({
			kind: 'dateTime',
		})
		expect(archived.provenance.fields.archivedAt).toMatchObject({
			contributionId: 'archivable.archivedAt',
			owner: { kind: 'plugin', pluginId: '@community/archive' },
		})
		expect(
			readSchemaRules(archived, { pluginId: '@community/archive' }),
		).toEqual({ archivable: { reason: true }, audit: true })
		expect(readSchemaRules(archived, { pluginId: 'community.other' })).toEqual(
			{},
		)
		expect(
			[...(surface(compiled, Archived.className)?.schemaMutations ?? [])].map(
				([name, { mutation }]) => [name, mutation.name, mutation.target],
			),
		).toEqual([
			['archiveOne', 'community.archive.archivable.archive-one', 'one'],
			['archiveMany', 'community.archive.archivable.archive-many', 'many'],
			['purgeOne', 'community.archive.archivable.purge-one', 'one'],
		])
		expect(surface(compiled, Plain.className)?.schemaMutations.size ?? 0).toBe(
			0,
		)
		expect(
			compiled.schemas.get(Plain.className)?.persistedFields,
		).not.toHaveProperty('archivedAt')
	})

	it('validates shape options and rules when the application compiles', () => {
		const App = UltimaBase.use(archivePlugin())
		const BadRule = App.Schema.define({
			className: 'FacadeBadRule',
			fields: (field) => ({ title: field.string() }),
		}).with({ audit: 'yes' } as never)
		const BadShape = App.Schema.define({
			className: 'FacadeBadShape',
			fields: (field) => ({ title: field.string() }),
		})
			.archivable('soon' as never)
			.with({})

		expect(() =>
			new App({ logger: false, schemas: [BadRule] }).compile(),
		).toThrow(
			'FacadeBadRule.audit is invalid for option owner @community/archive',
		)
		expect(() =>
			new App({ logger: false, schemas: [BadShape] }).compile(),
		).toThrow(
			'FacadeBadShape.archivable is invalid for option owner @community/archive',
		)
	})

	it('rejects arguments to a shape method declared without options', () => {
		const App = UltimaBase.use(
			definePlugin({
				name: '@community/flag',
				shape: { flag: shapeMethod({}) },
			}),
		)
		const Flagged = App.Schema.define({
			className: 'FacadeFlagged',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
		})
			.flag(...([{ loud: true }] as unknown as []))
			.with({})

		expect(() =>
			new App({ logger: false, schemas: [Flagged] }).compile(),
		).toThrow('FacadeFlagged.flag is invalid for option owner @community/flag')
	})

	it('rejects malformed definitions before Core sees them', () => {
		expect(() =>
			definePlugin({ name: 'community.bad', extra: 1 } as never),
		).toThrow('Unknown definePlugin option: extra')
		expect(() =>
			definePlugin({ name: 'community.bad', shape: { with: shapeMethod({}) } }),
		).toThrow('Invalid shape method name: with')
		expect(() =>
			definePlugin({
				name: 'community.bad',
				shape: { audit: shapeMethod({}) },
				rules: { audit: isBoolean },
			}),
		).toThrow('Rule audit is also a shape method')
		expect(() =>
			definePlugin({ name: 'community.bad', contributions: {} as never }),
		).toThrow('definePlugin contributions must be an array')
		expect(() => shapeMethod({ fields: [] } as never)).toThrow(
			'shape method fields must be a plain object',
		)
		expect(() => shapeMethod({ apply: () => ({}) } as never)).toThrow(
			'Unknown shape method option: apply',
		)
		expect(() => shapeMethod({ permissions: ['read archived'] })).toThrow(
			'shape method permissions must list identifiers',
		)
	})

	it('declares shape-method permissions through one Core provider (ADR-0317)', () => {
		const withPermission = definePlugin({
			name: '@community/archive-permission',
			shape: { archivable: shapeMethod({ permissions: ['readArchived'] }) },
		})
		expect(withPermission.manifest.capabilities.provides).toEqual([
			expect.objectContaining({ contributionId: 'permissions' }),
		])
		// No permission is declared, so no provider is added.
		expect(archivePlugin().manifest.capabilities.provides).toEqual([])
	})

	it('rejects commands that Core could not run', () => {
		expect(() =>
			command({ authority: 'anyone', effect: 'update' } as never),
		).toThrow('command authority must be request or master')
		expect(() =>
			command({ authority: 'master', effect: 'delete', data: () => ({}) }),
		).toThrow('delete commands write no data')
		expect(() =>
			command({
				authority: 'request',
				effect: 'update',
				target: 'all',
			} as never),
		).toThrow('command target must be one or many')
		expect(() =>
			command({ authority: 'request', effect: 'update', run: 1 } as never),
		).toThrow('Unknown command option: run')
		// Core refuses request-authority deletes when the plugin is defined.
		expect(() =>
			definePlugin({
				name: 'community.bad',
				shape: {
					erase: shapeMethod({
						commands: {
							eraseOne: command({ authority: 'request', effect: 'delete' }),
						},
					}),
				},
			}),
		).toThrow('delete schema mutations must require master authority')
	})
})
