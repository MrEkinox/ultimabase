import { type Pointer, type Principal, UltimaBase } from '@ultimabase/core'
import type { PluginExports } from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import { ACL } from './acl.js'
import type { ACLEntry } from './acl-entries.js'
import { aclPlugin } from './plugin.js'

const Application = UltimaBase.use(aclPlugin())

test('does not expose a redundant application-local setup value', () => {
	expectTypeOf<
		PluginExports<ReturnType<typeof aclPlugin>>
	>().toEqualTypeOf<undefined>()
})

const Post = Application.Schema.define({
	className: 'DirectACLTypePost',
	fields: (field) => ({
		title: field.string({ required: true }),
		visibility: field.string(),
	}),
})
	.acl()
	.with({
		acl: {
			default: ({ data, principal, context }) => {
				// ADR-0321: sibling fields are typed without Typegen.
				expectTypeOf(data.title).toEqualTypeOf<string>()
				expectTypeOf(data.visibility).toEqualTypeOf<string | null>()
				expectTypeOf(principal).toEqualTypeOf<Principal | undefined>()
				expectTypeOf(context.requestId).toBeString()
				return new ACL(principal)
			},
			existingRows: new ACL().grantAuthenticated('read'),
			resolveInput: (input) => {
				expectTypeOf(input.data.title).toEqualTypeOf<string>()
				if (input.operation === 'create') {
					expectTypeOf(input.currentData).toEqualTypeOf<undefined>()
					expectTypeOf(input.update).toEqualTypeOf<undefined>()
					return undefined
				}

				expectTypeOf(input.currentData.title).toEqualTypeOf<string>()
				expectTypeOf(input.update.kind).toEqualTypeOf<'update-expression'>()
				return input.currentAcl
			},
			clientSharing: ({ principal, currentAcl }) =>
				principal !== undefined &&
				currentAcl.hasPrincipalPermission(principal, 'delete'),
		},
	})

test('adds the acl field through the fields slot and types its updates', async () => {
	const post = await Post.findOne(
		{ select: { acl: true } },
		{ useMasterKey: true },
	)
	expectTypeOf(post?.acl).toEqualTypeOf<ACL | undefined>()
	expectTypeOf(post?.acl.entries()).toEqualTypeOf<
		readonly ACLEntry[] | undefined
	>()
	const user = Application.Schema.define({
		className: 'DirectACLTypeUser',
		fields: () => ({}),
	}).with({})
	const principal: Pointer = user.pointer('user-id')
	await Post.updateOne({
		where: { id: 'post-id' },
		data: { acl: { grant: { principal, permissions: ['read', 'write'] } } },
	})
	await Post.updateOne({
		where: { id: 'post-id' },
		data: { acl: { revoke: { principal } } },
	})
	await Post.updateOne({
		where: { id: 'post-id' },
		data: { acl: new ACL() },
	})
	await Post.updateOne({
		where: { id: 'post-id' },
		// @ts-expect-error -- `grant` needs permissions.
		data: { acl: { grant: { principal } } },
	})
	await Post.createOne({
		// @ts-expect-error -- `grant`/`revoke` apply to updates only.
		data: { title: 'x', acl: { grant: { principal, permissions: ['read'] } } },
	})
})

test('requires default once .acl() is called and acl only after it', () => {
	Application.Schema.define({
		className: 'MissingACLRulePost',
		fields: (field) => ({ title: field.string() }),
	})
		.acl()
		// @ts-expect-error -- `acl.default` is required once `.acl()` is called.
		.with({})
	Application.Schema.define({
		className: 'MissingACLDefaultPost',
		fields: (field) => ({ title: field.string() }),
	})
		.acl()
		// @ts-expect-error -- An empty ACL would hide every row from everyone but Master.
		.with({ acl: { resolveInput: () => undefined } })
	Application.Schema.define({
		className: 'ACLWithoutShapePost',
		fields: (field) => ({ title: field.string() }),
	}).with({
		// @ts-expect-error -- `acl` rules need `.acl()` first.
		acl: { default: new ACL() },
	})
	// @ts-expect-error -- The template-based schema option is removed (ADR-0321).
	Application.Schema.define({
		className: 'LegacyACLOptionPost',
		fields: (field) => ({ title: field.string() }),
	})
		.acl()
		.with({
			acl: { default: new ACL() },
		})
})

test('rejects incompatible public ACL configuration', () => {
	const declare = (className: string) =>
		Application.Schema.define({
			className,
			fields: (field) => ({ title: field.string() }),
		}).acl()
	declare('InvalidDirectACLTypePost').with({
		// @ts-expect-error -- Static defaults must be immutable ACL values.
		acl: { default: { public: ['read'] } },
	})
	declare('InvalidDirectACLResolverPost').with({
		// @ts-expect-error -- Input resolution must return an ACL or undefined.
		acl: { default: new ACL(), resolveInput: () => true },
	})
	declare('InvalidDirectACLLimitsPost').with({
		// @ts-expect-error -- Schema limits accept only documented keys.
		acl: { default: new ACL(), limits: { maximum: 10 } },
	})
	declare('InvalidExistingRowsPost').with({
		// @ts-expect-error -- Existing rows receive one fixed ACL.
		acl: { default: new ACL(), existingRows: () => new ACL() },
	})
})
