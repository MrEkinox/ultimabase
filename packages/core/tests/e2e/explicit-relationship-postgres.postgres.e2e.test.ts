import {
	requestSources,
	UltimaBase,
	type PluginSourceState,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const membershipTrace: string[] = []
const ExplicitRelationshipApplication =
	UltimaBase.use(accessPlugin()).use(hooksPlugin())

const Member = ExplicitRelationshipApplication.Schema.define({
	className: 'ExplicitEdgeMember',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})

const Project = ExplicitRelationshipApplication.Schema.define({
	className: 'ExplicitEdgeProject',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const Membership = ExplicitRelationshipApplication.Schema.define({
	className: 'ExplicitEdgeMembership',
	fields: (field) => ({
		internalNote: field.string({ access: { read: false } }),
		member: field.pointer({
			onDelete: 'cascade',
			target: 'ExplicitEdgeMember',
			required: true,
		}),
		position: field.int({ default: 0 }),
		project: field.pointer({
			onDelete: 'cascade',
			target: 'ExplicitEdgeProject',
			required: true,
		}),
		role: field.enum({
			required: true,
			values: ['editor', 'viewer'] as const,
		}),
	}),
	hooks: {
		afterOperation: {
			create: ({ operation }) => {
				membershipTrace.push(`created:${String(operation.input.role)}`)
			},
		},
		beforeOperation: {
			create: ({ item }) => {
				// The edge uses the ordinary schema lifecycle for cross-field invariants.
				if (item.role === 'viewer' && (item.position ?? 0) === 0) {
					throw new TypeError('The first project member must be an editor')
				}
			},
		},
	},
	indexes: [{ fields: ['project', 'member'], unique: true }],
})

const explicitRelationshipSchemas = [Member, Project, Membership] as const

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof explicitRelationshipSchemas],
			readonly [ReturnType<typeof postgresPlugin>],
			PluginSourceState
	  >
	| undefined

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Explicit relationship application has not started')
	}

	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		accessPlugin({ default: true }),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({ schemas: explicitRelationshipSchemas })

	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe(
	'explicit relationship models with PostgreSQL',
	{ concurrent: false },
	() => {
		it('uses ordinary Query, hooks, Access, and composite uniqueness', async () => {
			const member = await Member.createOne({ data: { name: 'Ada' } })
			const project = await Project.createOne({ data: { title: 'UltimaBase' } })
			const membership = await Membership.createOne({
				data: {
					internalNote: 'private edge data',
					member: { connect: member.id },
					project: { connect: project.id },
					role: 'editor',
				},
			})

			expect(membershipTrace).toContain('created:editor')
			expect(membership.toJSON()).not.toHaveProperty('internalNote')
			expect(
				await Membership.count({ where: { member: { eq: member.id } } }),
			).toBe(1)
			expect(
				await Membership.count({ where: { project: { eq: project.id } } }),
			).toBe(1)

			const selected = await Membership.findOne({
				where: { id: { eq: membership.id } },
				include: {
					project: { select: { id: true, title: true } },
				},
				select: {
					id: true,
					member: true,
					position: true,
					project: true,
					role: true,
				},
			})

			expect(selected?.toJSON()).toMatchObject({
				id: membership.id,
				position: 0,
				project: { id: project.id, title: 'UltimaBase' },
				role: 'editor',
			})

			await expect(
				Membership.createOne({
					data: {
						member: { connect: member.id },
						position: 1,
						project: { connect: project.id },
						role: 'viewer',
					},
				}),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				internalDetails: { driverCode: '23505' },
			})
			await expect(
				Membership.createOne({
					data: {
						member: { connect: member.id },
						project: { connect: project.id },
						role: 'viewer',
					},
				}),
			).rejects.toThrow('The first project member must be an editor')
			await expect(
				Membership.findMany({ select: { internalNote: true } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})

		it('keeps edge writes atomic and applies pointer referential actions', async () => {
			const app = getUltimaBase()
			const member = await Member.createOne({ data: { name: 'Grace' } })
			const project = await Project.createOne({
				data: { title: 'Cascade project' },
			})
			await Membership.createOne({
				data: {
					member: { connect: member.id },
					project: { connect: project.id },
					role: 'editor',
				},
			})

			await member.delete({})
			expect(
				await Membership.count({ where: { project: { eq: project.id } } }),
			).toBe(0)
			expect(await Project.exists({ where: { id: { eq: project.id } } })).toBe(
				true,
			)

			const request = app.anonymous({
				requestId: 'explicit-relationship-rollback',
				source: requestSources.internal,
			})
			const rollbackError = new Error('explicit relationship rollback fixture')

			await expect(
				request.transaction(async () => {
					const rolledBackMember = await Member.createOne({
						data: {
							name: 'Rolled back member',
						},
					})
					const rolledBackProject = await Project.createOne({
						data: {
							title: 'Rolled back project',
						},
					})

					await Membership.createOne({
						data: {
							member: { connect: rolledBackMember.id },
							project: { connect: rolledBackProject.id },
							role: 'editor',
						},
					})
					throw rollbackError
				}),
			).rejects.toBe(rollbackError)

			// The edge and both endpoints share the same explicit transaction boundary.
			expect(
				await Member.exists({ where: { name: { eq: 'Rolled back member' } } }),
			).toBe(false)
			expect(
				await Project.exists({
					where: { title: { eq: 'Rolled back project' } },
				}),
			).toBe(false)
		})
	},
)
