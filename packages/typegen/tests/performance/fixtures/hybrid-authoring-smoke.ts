import {
	UltimaBase,
	accessPlugin,
	hooksPlugin,
	passwordAuthPlugin,
	pgVectorPlugin,
	rolesPlugin,
	softDeletePlugin,
	validationPlugin,
} from './hybrid-authoring-contract.js'
import type * as Contract from './hybrid-authoring-contract.js'

declare module './hybrid-authoring-contract.js' {
	interface GeneratedSchemaRegistry {
		readonly Post: Contract.GeneratedSchema<
			'Post',
			{
				readonly author: {
					readonly hasDefault: false
					readonly kind: 'pointer'
					readonly required: true
					readonly target: 'User'
				}
				readonly embedding: Contract.VectorField
				readonly isDeleted: Contract.SoftDeleteField
				readonly published: {
					readonly hasDefault: true
					readonly kind: 'boolean'
					readonly required: false
					readonly value: boolean
				}
				readonly title: {
					readonly hasDefault: false
					readonly kind: 'string'
					readonly required: true
					readonly value: string
				}
			}
		>
		readonly Role: Contract.GeneratedSchema<
			'Role',
			{
				readonly isDeleted: Contract.SoftDeleteField
				readonly members: Contract.SourceRelationField<'User'>
				readonly name: Contract.RoleNameField
				readonly roles: Contract.SourceRelationField<'Role'>
			}
		>
		readonly User: Contract.GeneratedSchema<
			'User',
			{
				readonly email: {
					readonly hasDefault: false
					readonly kind: 'string'
					readonly required: true
					readonly value: string
				}
				readonly isDeleted: Contract.SoftDeleteField
				readonly posts: {
					readonly hasDefault: true
					readonly kind: 'relation'
					readonly required: true
					readonly target: 'Post'
				}
			}
		>
	}
}

declare const titleValidation: Contract.StandardSchema<string>

const Blog = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(passwordAuthPlugin())
	.use(pgVectorPlugin())
	.use(rolesPlugin())
	.use(softDeletePlugin({ defaultMode: 'explicit' }))
	.use(validationPlugin())

export const User = Blog.Schema.define({
	className: 'User',
	fields: (field) => ({
		email: field.string({ required: true }),
		posts: field.relation({ mappedBy: 'author', target: 'Post' }),
	}),
	access: {
		read: { item: ({ item }) => item.email.endsWith('@example.com') },
	},
})

export const Post = Blog.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'User' }),
		embedding: field.vector({ dimensions: 3 }),
		published: field.boolean({ default: false }),
		title: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
			required: true,
			validation: titleValidation,
		}),
	}),
	softDelete: 'explicit',
	access: {
		read: {
			filter: ({ where }) => ({
				...where,
				author: { is: { email: { ne: 'blocked@example.com' } } },
			}),
		},
	},
	hooks: {
		afterOperation: {
			create: ({ item }) => {
				item.title.toUpperCase()
			},
		},
	},
})

export const Role = Blog.Schema.define({
	className: 'Role',
	fields: () => ({}),
})

export const Portable = UltimaBase.Schema.define({
	className: 'Portable',
	fields: (field) => ({ label: field.string({ required: true }) }),
})

export const application = new Blog({
	schemas: [User, Post, Role, Portable],
})

const useProof = async () => {
	const post = await Post.createOne({
		data: {
			author: {
				create: { email: 'ada@example.com', posts: { connect: ['post-1'] } },
			},
			embedding: [0.1, 0.2, 0.3],
			title: 'Typed',
		},
	})
	post.isDeleted.valueOf()
	const author = await post.author.findOne()
	author?.email.toUpperCase()
	await Post.softDelete({ id: post.id, select: { id: true, title: true } })
	await User.signUp({
		email: 'ada@example.com',
		password: 'correct horse battery staple',
		posts: { connect: ['post-1'] },
		username: 'ada',
	})
	Role.role('editor').selector.toUpperCase()
	await Role.findMany({
		where: { members: { some: { email: { eq: 'ada@example.com' } } } },
	})
	await application.operations.runWithSession('token', () => User.findMany())
}

void Post.createOne({
	data: {
		author: { connect: 'user-1' },
		// @ts-expect-error -- the source-projected tombstone is output-only.
		isDeleted: true,
		title: 'Forbidden tombstone',
	},
})

void useProof
