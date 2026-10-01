import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { SoftDeleteSchemaOption } from './contracts.js'
import {
	normalizeSoftDeletePluginOptions,
	resolveSoftDeleteMode,
} from './options.js'
import { softDeletePlugin } from './plugin.js'

const SoftDeleteSchemaApplication = UltimaBase.use(softDeletePlugin())
const schemaWith = (className: string, softDelete?: SoftDeleteSchemaOption) =>
	SoftDeleteSchemaApplication.Schema.define({
		className,
		...(softDelete === undefined ? {} : { softDelete }),
		fields: (field) => ({ title: field.string() }),
	})

describe('soft-delete options', () => {
	it('normalizes the safe disabled default and every explicit factory mode', () => {
		expect(normalizeSoftDeletePluginOptions({})).toStrictEqual({
			defaultMode: 'disabled',
		})
		for (const defaultMode of [
			'disabled',
			'replace-delete',
			'explicit',
		] as const) {
			const normalized = normalizeSoftDeletePluginOptions({ defaultMode })
			expect(normalized).toStrictEqual({ defaultMode })
			expect(Object.isFrozen(normalized)).toBe(true)
		}
	})

	it('rejects unknown, malformed, and mutable-selector factory options', () => {
		for (const value of [
			null,
			{ defaultMode: true },
			{ defaultMode: 'delete' },
			{ instanceId: '' },
			{ schemas: ['Post'] },
			{ select: () => true },
		]) {
			expect(() => normalizeSoftDeletePluginOptions(value as never)).toThrow(
				TypeError,
			)
		}
	})

	it('resolves omission through the default and direct false as disabled', () => {
		expect(resolveSoftDeleteMode(schemaWith('InheritedMode'), 'explicit')).toBe(
			'explicit',
		)
		expect(
			resolveSoftDeleteMode(schemaWith('DisabledMode', false), 'explicit'),
		).toBe('disabled')
		expect(
			resolveSoftDeleteMode(
				schemaWith('ReplacedMode', 'replace-delete'),
				'explicit',
			),
		).toBe('replace-delete')
	})
})
