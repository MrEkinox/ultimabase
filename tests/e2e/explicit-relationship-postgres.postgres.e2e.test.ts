import {
	enumField,
	intField,
	pointerField,
	requestSources,
	Schema,
	stringField,
	UltimaBase,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const membershipTrace: string[] = []

const Member = Schema.define({
	className: 'ExplicitEdgeMember',
	fields: { name: stringField({ validation: { required: true } }) },
})

const Project = Schema.define({
	className: 'ExplicitEdgeProject',
	fields: { title: stringField({ validation: { required: true } }) },
})

const Membership = Schema.define({
	className: 'ExplicitEdgeMembership',
	fields: {
		internalNote: stringField({ access: { read: false } }),
		member: pointerField({
			onDelete: 'cascade',
			target: () => Member,
			validation: { required: true },
		}),
		position: intField({ default: 0 }),
		project: pointerField({
			onDelete: 'cascade',
			target: () => Project,
			validation: { required: true },
		}),
		role: enumField({
			validation: { required: true },
			values: ['editor', 'viewer'] as const,
		}),
	},
	hooks: {
		afterOperation: {
			create: ({ operation }) => {
				if (operation.kind === 'create-one') {
					membershipTrace.push(`created:${operation.input.role}`)
				}
			},
		},
		beforeOperation: {
			create: ({ operation }) => {
				// The edge uses the ordinary schema lifecycle for cross-field invariants.
				if (
					operation.kind === 'create-one' &&
					operation.input.role === 'viewer' &&
					(operation.input.position ?? 0) === 0
				) {
					throw new TypeError('The first project member must be an editor')
				}

				void operation
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
			readonly [ReturnType<typeof postgresPlugin>]
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
	ultimabase = new UltimaBase({
		plugins: [
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
		schemas: explicitRelationshipSchemas,
	})

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
			const app = getUltimaBase()
			const member = await Member.createOne(
				{ data: { name: 'Ada' } },
				{ ultimabase: app },
			)
			const project = await Project.createOne(
				{ data: { title: 'UltimaBase' } },
				{ ultimabase: app },
			)
			const membership = await Membership.createOne(
				{
					data: {
						internalNote: 'private edge data',
						member: Member.pointer(member.id),
						project: Project.pointer(project.id),
						role: 'editor',
					},
				},
				{ ultimabase: app },
			)

			expect(membershipTrace).toContain('created:editor')
			expect(membership.toJSON()).not.toHaveProperty('internalNote')
			expect(
				await Membership.count(
					{ where: { member: { eq: member.id } } },
					{ ultimabase: app },
				),
			).toBe(1)
			expect(
				await Membership.count(
					{ where: { project: { eq: project.id } } },
					{ ultimabase: app },
				),
			).toBe(1)

			const selected = await Membership.findOne(
				{
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
				},
				{ ultimabase: app },
			)

			expect(selected?.toJSON()).toMatchObject({
				id: membership.id,
				position: 0,
				project: { id: project.id, title: 'UltimaBase' },
				role: 'editor',
			})

			await expect(
				Membership.createOne(
					{
						data: {
							member: Member.pointer(member.id),
							position: 1,
							project: Project.pointer(project.id),
							role: 'viewer',
						},
					},
					{ ultimabase: app },
				),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: { driverCode: '23505' },
			})
			await expect(
				Membership.createOne(
					{
						data: {
							member: Member.pointer(member.id),
							project: Project.pointer(project.id),
							role: 'viewer',
						},
					},
					{ ultimabase: app },
				),
			).rejects.toThrow('The first project member must be an editor')
			await expect(
				Membership.findMany(
					{ select: { internalNote: true } },
					{ ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})

		it('keeps edge writes atomic and applies pointer referential actions', async () => {
			const app = getUltimaBase()
			const member = await Member.createOne(
				{ data: { name: 'Grace' } },
				{ ultimabase: app },
			)
			const project = await Project.createOne(
				{ data: { title: 'Cascade project' } },
				{ ultimabase: app },
			)
			await Membership.createOne(
				{
					data: {
						member: Member.pointer(member.id),
						project: Project.pointer(project.id),
						role: 'editor',
					},
				},
				{ ultimabase: app },
			)

			await member.delete({}, { ultimabase: app })
			expect(
				await Membership.count(
					{ where: { project: { eq: project.id } } },
					{ ultimabase: app },
				),
			).toBe(0)
			expect(
				await Project.exists(
					{ where: { id: { eq: project.id } } },
					{ ultimabase: app },
				),
			).toBe(true)

			const request = app.engine.anonymous({
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
							member: Member.pointer(rolledBackMember.id),
							project: Project.pointer(rolledBackProject.id),
							role: 'editor',
						},
					})
					throw rollbackError
				}),
			).rejects.toBe(rollbackError)

			// The edge and both endpoints share the same explicit transaction boundary.
			expect(
				await Member.exists(
					{ where: { name: { eq: 'Rolled back member' } } },
					{ ultimabase: app },
				),
			).toBe(false)
			expect(
				await Project.exists(
					{ where: { title: { eq: 'Rolled back project' } } },
					{ ultimabase: app },
				),
			).toBe(false)
		})
	},
)
