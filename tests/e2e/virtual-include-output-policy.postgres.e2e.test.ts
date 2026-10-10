import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// Regression: a complete include (no `select`) of a target whose virtual field
// an output policy hides failed with "Requested virtual field is missing".
const App = UltimaBase.use(accessPlugin({ default: true }))

const Person = App.Schema.define({
	className: 'VirtualIncludePerson',
	fields: (field) => ({
		name: field.string({ required: true }),
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `Person: ${item.name}`,
			select: { name: true },
		}),
		hiddenLabel: field.virtual({
			access: {
				read: { orderBy: false, output: isAuthenticated, where: false },
			},
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `Hidden: ${item.name}`,
			select: { name: true },
		}),
	}),
})

const Post = App.Schema.define({
	className: 'VirtualIncludePost',
	fields: (field) => ({
		author: field.pointer({ target: 'VirtualIncludePerson' }),
		reviewers: field.relation({ target: 'VirtualIncludePerson' }),
		title: field.string({ required: true }),
	}),
})

let fixture: PostgresWorkerFixture | undefined
let application: InstanceType<ReturnType<typeof createFactory>> | undefined

const createFactory = (url: string) =>
	App.use(postgresPlugin({ schemaPolicy: 'override', url }))

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'virtual_include' })
	application = new (createFactory(fixture.connectionUri))({
		pluginPrivileges: { logger: false },
		schemas: [Person, Post],
	})
	await application.start()
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe('complete includes of targets with virtual fields', () => {
	it('materializes visible virtual fields and omits hidden ones', async () => {
		const person = await Person.createOne({
			data: { name: 'Ada' },
			select: { id: true },
		})
		const post = await Post.createOne({
			data: {
				author: { connect: person.id },
				reviewers: { connect: [person.id] },
				title: 'Includes',
			},
			select: { id: true },
		})

		const loaded = await Post.findOneOrThrow({
			include: { author: {}, reviewers: {} },
			where: { id: { eq: post.id } },
		})

		expect(loaded.author).toMatchObject({ label: 'Person: Ada', name: 'Ada' })
		expect(loaded.author).not.toHaveProperty('hiddenLabel')
		expect(loaded.reviewers).toHaveLength(1)
		expect(loaded.reviewers[0]).toMatchObject({ label: 'Person: Ada' })
		expect(loaded.reviewers[0]).not.toHaveProperty('hiddenLabel')
	})
})
