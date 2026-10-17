import { describe, expect, it } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { plugin } from '../../plugins/plugin.js'
import { UltimaBase } from '../application/ultima-base.js'
import { authorizeMasterKey } from '../application/plugin-authority.js'
import {
	MasterAuthority,
	masterAuthorityHasKeys,
	resolveMasterAuthorityKeys,
	type MasterAccessEvent,
	type MasterKeyDefinition,
} from './master-authority.js'

// ADR-0340 decision 1: in-process Master needs no key; keys may be read
// lazily, once, when the application starts.
const Article = UltimaBase.Schema.define({
	className: 'MasterKeysArticle',
	fields: (field) => ({ title: field.string() }),
})

const databasePlugin = () =>
	plugin({
		id: 'fixture.master-keys-database',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			provideTestDatabaseAdapter(
				new RecordingDatabaseAdapter(
					[
						{ status: 'fulfilled', value: [] },
						{ status: 'fulfilled', value: [] },
					],
					[],
				),
			),
		],
	})

describe('MasterAuthority keys', () => {
	it('accepts an authority without keys, which verifies no raw key', () => {
		const authority = new MasterAuthority({ onUse: () => undefined })

		expect(masterAuthorityHasKeys(authority)).toBe(false)
		expect(() => authority.authorize('any-secret')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		expect(
			masterAuthorityHasKeys(
				new MasterAuthority({ keys: [], onUse: () => undefined }),
			),
		).toBe(false)
	})

	it('reads lazy keys once, when they are resolved, never at construction', () => {
		let reads = 0
		const authority = new MasterAuthority({
			keys: () => {
				reads += 1
				return [{ id: 'lazy', value: 'lazy-secret' }]
			},
			onUse: () => undefined,
		})

		expect(reads).toBe(0)
		expect(() => authority.authorize('lazy-secret')).toThrow(
			new TypeError(
				'Master authority keys are read when the application starts',
			),
		)
		resolveMasterAuthorityKeys(authority)
		resolveMasterAuthorityKeys(authority)
		expect(reads).toBe(1)
		expect(masterAuthorityHasKeys(authority)).toBe(true)
		expect(authority.authorize('lazy-secret').keyId).toBe('lazy')
	})

	it('validates lazy keys like static ones when they are read', () => {
		const invalid: readonly {
			readonly keys: () => readonly MasterKeyDefinition[]
			readonly message: string
		}[] = [
			{
				keys: () => 'secret' as never,
				message: 'Master authority keys must be an array',
			},
			{
				keys: () => [{ id: 'empty', value: '' }],
				message: 'Master key value must be a non-empty string',
			},
		]
		for (const { keys, message } of invalid) {
			const authority = new MasterAuthority({ keys, onUse: () => undefined })
			expect(() => {
				resolveMasterAuthorityKeys(authority)
			}).toThrow(new TypeError(message))
		}
		expect(
			() =>
				new MasterAuthority({
					keys: 'secret' as never,
					onUse: () => undefined,
				}),
		).toThrow(
			new TypeError(
				'Master authority keys must be an array or a function returning one',
			),
		)
	})

	it('elevates in process without keys and audits every use', async () => {
		const events: MasterAccessEvent[] = []
		const ultimabase = applicationFixture(
			new (UltimaBase.use(databasePlugin()))({
				logger: false,
				masterAuthority: new MasterAuthority({
					onUse: (event) => {
						events.push(event)
					},
				}),
				schemas: [Article],
			}),
		)
		await ultimabase.start()

		await Article.findMany({}, { useMasterKey: true })

		expect(events).toMatchObject([
			{ keyId: 'in-process', kind: 'master-access' },
		])
		expect(() => authorizeMasterKey(ultimabase, 'any-secret')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
	})

	it('reads lazy keys at start(), and labels in-process uses with the first key', async () => {
		const events: MasterAccessEvent[] = []
		let reads = 0
		const ultimabase = applicationFixture(
			new (UltimaBase.use(databasePlugin()))({
				logger: false,
				masterAuthority: new MasterAuthority({
					keys: () => {
						reads += 1
						return [{ id: 'operations', value: 'operations-secret' }]
					},
					onUse: (event) => {
						events.push(event)
					},
				}),
				schemas: [Article],
			}),
		)
		expect(reads).toBe(0)

		await ultimabase.start()

		expect(reads).toBe(1)
		await Article.findMany({}, { useMasterKey: true })
		expect(events).toMatchObject([{ keyId: 'operations' }])
		expect(authorizeMasterKey(ultimabase, 'operations-secret').keyId).toBe(
			'operations',
		)
	})

	it('fails start() when lazy keys are invalid', async () => {
		const ultimabase = applicationFixture(
			new (UltimaBase.use(databasePlugin()))({
				logger: false,
				masterAuthority: new MasterAuthority({
					keys: () => [{ id: 'unset', value: '' }],
					onUse: () => undefined,
				}),
				schemas: [Article],
			}),
		)

		await expect(ultimabase.start()).rejects.toThrow(
			new TypeError('Master key value must be a non-empty string'),
		)
	})
})
