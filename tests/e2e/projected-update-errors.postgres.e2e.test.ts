import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// The database computes an atomic delta or an object patch from the stored
// value. Core validates that projected value on the locked target, so an
// invalid result is the client's VALIDATION_ERROR (REST 422), never a masked
// and logged server failure.
const App = UltimaBase.use(accessPlugin({ allowWithoutRule: { all: true } }))

const Place = App.Schema.define({
	className: 'ProjectedUpdatePlace',
	fields: (field) => ({
		visits: field.int(),
		location: field.object({
			fields: (child) => ({
				lat: child.float({ required: true }),
				lng: child.float({ required: true }),
			}),
		}),
	}),
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.projected-update-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const logger = {
	debug: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
}
const appId = 'projected-update-errors'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		restPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ logger, logLevel: 'error', schemas: [Place] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'projected_update' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

const patch = async (id: string, data: unknown) => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers({
		'content-type': 'application/json',
		[httpApplicationIdHeader]: appId,
	})
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await capture.current.fetch({
		originalHeaders,
		request: new Request(
			`https://example.test/api/classes/${Place.className}/${id}`,
			{ body: JSON.stringify(data), headers, method: 'PATCH' },
		),
	})
	const body: unknown = await response.json()
	return { body, status: response.status }
}

describe('projected update values through REST', () => {
	it('answers 422 for an unsafe increment and a null object patch, without logging', async () => {
		const place = await Place.createOne({
			data: { visits: Number.MAX_SAFE_INTEGER },
		})
		logger.error.mockClear()

		await expect(
			patch(place.id, { visits: { increment: 1 } }),
		).resolves.toMatchObject({
			status: 422,
			body: {
				error: {
					code: 'VALIDATION_ERROR',
					details: {
						issues: [
							{ code: 'int.type', path: ['update', 0, 'visits', 'value'] },
						],
					},
				},
			},
		})
		await expect(
			patch(place.id, { location: { lat: 1 } }),
		).resolves.toMatchObject({
			status: 422,
			body: {
				error: {
					code: 'VALIDATION_ERROR',
					details: {
						issues: [
							{
								code: 'field.required',
								path: ['update', 0, 'location', 'value', 'lng'],
							},
						],
					},
				},
			},
		})
		expect(logger.error).not.toHaveBeenCalled()
		await expect(
			Place.findOneOrThrow({ where: { id: place.id } }),
		).resolves.toMatchObject({
			location: null,
			visits: Number.MAX_SAFE_INTEGER,
		})
	})
})
