import { FrameworkError, UltimaBase } from '@ultimabase/core'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { accessPlugin } from '../src/index.js'
import {
	createFixtureDatabase,
	fixtureRowId as rowId,
} from './access-fixtures.test-support.js'

// ADR-0317, decision 5: a denial is explained on the server only.
const database = createFixtureDatabase().plugin

const App = UltimaBase.use(accessPlugin())
const Bare = App.Schema.define({
	className: 'DeniedBare',
	fields: (field) => ({ title: field.string() }),
}).with({})
const Ruled = App.Schema.define({
	className: 'DeniedRuled',
	fields: (field) => ({
		hidden: field.string({ access: { read: false, write: false } }),
		secret: field.string({ access: { read: { orderBy: false } } }),
		title: field.string(),
	}),
}).with({
	access: {
		read: true,
		create: false,
		update: { where: true, item: () => false },
		delete: { where: () => false, item: () => true },
	},
})

const start = async () => {
	const logger = createCapturingLogger()
	const ultimabase = new (UltimaBase.use(accessPlugin(), database))({
		logger,
		logLevel: 'debug',
		schemas: [Bare, Ruled],
	})
	await ultimabase.start()
	logger.clear()
	return { logger, ultimabase }
}

const denials = (
	logger: ReturnType<typeof createCapturingLogger>,
	level: 'debug' | 'info',
) => logger.messages(level).filter((message) => message.includes('denied'))

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('Access denial diagnostics (ADR-0317)', () => {
	it('logs the schema, operation, step and rule at info outside production', async () => {
		const { logger, ultimabase } = await start()
		try {
			await expect(Bare.findMany()).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			await expect(
				Ruled.createOne({ data: { title: 'x' } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Ruled.deleteOne({ where: { id: { eq: rowId } } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Ruled.updateOne({
					data: { title: 'y' },
					where: { id: { eq: rowId } },
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Ruled.findMany({ orderBy: { secret: 'asc' } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Ruled.findMany({ select: { hidden: true } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				Ruled.updateOne({
					data: { hidden: 'x' },
					where: { id: { eq: rowId } },
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(denials(logger, 'info')).toEqual([
				'[@ultimabase/access-plugin] denied many on DeniedBare at the operation step (no rule for many, and allowWithoutRule does not open it).',
				'[@ultimabase/access-plugin] denied create on DeniedRuled at the operation step (DeniedRuled.access.create).',
				'[@ultimabase/access-plugin] denied delete on DeniedRuled at the row filter step (DeniedRuled.access.delete.where).',
				'[@ultimabase/access-plugin] denied update on DeniedRuled at the item step (DeniedRuled.access.update.item).',
				'[@ultimabase/access-plugin] denied many on DeniedRuled at the field step (DeniedRuled.secret.access.read.orderBy).',
				'[@ultimabase/access-plugin] denied many on DeniedRuled at the field step (DeniedRuled.hidden.access.read.output).',
				'[@ultimabase/access-plugin] denied update on DeniedRuled at the field step (DeniedRuled.hidden.access.write.fill).',
			])
			expect(denials(logger, 'debug')).toEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('logs the same line at debug in production and tells clients nothing new', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const { logger, ultimabase } = await start()
		try {
			const error: unknown = await Bare.findMany().catch(
				(failure: unknown) => failure,
			)
			if (!(error instanceof FrameworkError)) throw error
			expect(error.code).toBe('PERMISSION_DENIED')
			expect(JSON.stringify(error.toJSON())).not.toContain('allowWithoutRule')
			expect(denials(logger, 'info')).toEqual([])
			expect(denials(logger, 'debug')).toEqual([
				'[@ultimabase/access-plugin] denied many on DeniedBare at the operation step (no rule for many, and allowWithoutRule does not open it).',
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('does not log can() answers', async () => {
		const { logger, ultimabase } = await start()
		try {
			await expect(
				ultimabase.can({ operation: 'many', schema: Bare }),
			).resolves.toBe(false)
			expect(denials(logger, 'info')).toEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})
})
