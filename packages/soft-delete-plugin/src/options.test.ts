import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { parseSoftDeleteOptions, readSoftDeleteMode } from './options.js'
import { softDeletePlugin } from './plugin.js'

const App = UltimaBase.use(softDeletePlugin())
const owner = { pluginId: '@ultimabase/soft-delete-plugin' }
const declare = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
	})
// The same schema with `softDelete: true`, then with the command mode.
const declareLogical = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		softDelete: true,
	})
const declareCommand = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		softDelete: { mode: 'command' },
	})

describe('soft-delete options', () => {
	it('accepts only the empty options object and the command mode', () => {
		expect(parseSoftDeleteOptions({}, 'Todo.softDelete')).toStrictEqual({})
		const command = parseSoftDeleteOptions(
			{ mode: 'command' },
			'Todo.softDelete',
		)
		expect(command).toStrictEqual({ mode: 'command' })
		expect(Object.isFrozen(command)).toBe(true)
		for (const value of [
			null,
			'command',
			{ mode: 'explicit' },
			{ mode: 'replace-delete' },
			{ defaultMode: 'disabled' },
		]) {
			expect(() => parseSoftDeleteOptions(value, 'Todo.softDelete')).toThrow(
				TypeError,
			)
		}
	})

	it('reads each compiled schema mode for this plugin instance only', () => {
		const Logical = declareLogical('LogicalMode')
		const Command = declareCommand('CommandMode')
		const Plain = declare('PlainMode')
		const { schemas } = new App({
			logger: false,
			schemas: [Logical, Command, Plain],
		}).compile()
		const mode = (className: string, identity = owner) => {
			const schema = schemas.get(className)
			if (schema === undefined) throw new TypeError(`Missing ${className}`)
			return readSoftDeleteMode(schema, identity)
		}

		expect(mode('LogicalMode')).toBe('delete')
		expect(mode('CommandMode')).toBe('command')
		expect(mode('PlainMode')).toBeUndefined()
		expect(mode('LogicalMode', { pluginId: 'community.other' })).toBe(undefined)
	})

	it('rejects invalid options when the application compiles', () => {
		const Invalid = App.Schema.define({
			className: 'InvalidMode',
			fields: (field) => ({ title: field.string() }),
			// @ts-expect-error -- Only `mode: 'command'` exists.
			softDelete: { mode: 'replace-delete' },
		})
		expect(() =>
			new App({ logger: false, schemas: [Invalid] }).compile(),
		).toThrow(
			'InvalidMode.softDelete is invalid for option owner @ultimabase/soft-delete-plugin',
		)
	})
})
