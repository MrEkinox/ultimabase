import {
	FrameworkError,
	Schema,
	createApplication,
	stringField,
	type HookContext,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { ACL } from './acl.js'
import { acl } from './acl-extension.js'
import { aclPlugin, resolveCreateOperationACL } from './plugin.js'

const context = Object.freeze({ requestId: 'acl-test' }) as unknown as HookContext
const ProtectedPost = Schema.define({
	className: 'ProtectedPluginPost',
	fields: { title: stringField({ validation: { required: true } }) },
	extensions: [acl()],
})
const protectedPostNode = ProtectedPost.query().ast.schema

describe('aclPlugin create input resolution', () => {
	it('requires the owning plugin only when a schema declares acl()', async () => {
		await expect(
			createApplication({ schemas: [ProtectedPost], plugins: [] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
		} satisfies Partial<FrameworkError>)

		const application = await createApplication({
			schemas: [ProtectedPost],
			plugins: [aclPlugin()],
		})

		expect(application.getPlugin('ultimabase.acl').schemas).toStrictEqual([
			ProtectedPost,
		])
	})

	it('derives one ACL from resolved row data without exposing the reserved field', async () => {
		const generated = new ACL().grantPublic('read')
		const defaultFactory = vi.fn(({ data }) => {
			expect(data).toStrictEqual({ title: 'Visible' })

			return generated
		})
		const extension = acl({ default: defaultFactory })
		const operation = {
			input: { title: 'Visible' },
			kind: 'create-one',
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			extension.config,
			undefined,
			context,
		)

		expect(resolved.input).toStrictEqual({ title: 'Visible', acl: generated })
		expect(defaultFactory).toHaveBeenCalledOnce()
		expect(operation.input).not.toHaveProperty('acl')
	})

	it('runs asynchronous defaults independently for every create-many item', async () => {
		const defaultFactory = vi.fn(async ({ data }) =>
			new ACL().grantPublic(data.title === 'First' ? 'read' : 'delete'),
		)
		const extension = acl({ default: defaultFactory })
		const operation = {
			inputs: [{ title: 'First' }, { title: 'Second' }],
			kind: 'create-many',
			options: { atomic: true },
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			extension.config,
			undefined,
			context,
		)

		expect(defaultFactory).toHaveBeenCalledTimes(2)
		const firstACL: unknown = Reflect.get(resolved.inputs[0] ?? {}, 'acl')
		const secondACL: unknown = Reflect.get(resolved.inputs[1] ?? {}, 'acl')

		expect(firstACL).toBeInstanceOf(ACL)
		expect(secondACL).toBeInstanceOf(ACL)
		if (!(firstACL instanceof ACL) || !(secondACL instanceof ACL)) {
			throw new TypeError('Resolved create-many items must contain ACL values')
		}
		expect(firstACL.permissionsForPublic()).toStrictEqual(['read'])
		expect(secondACL.permissionsForPublic()).toStrictEqual(['delete'])
	})

	it('rejects explicit input by default and lets one resolver accept it', async () => {
		const explicit = new ACL().grantPublic('read')
		const operation = {
			input: { title: 'Explicit', acl: explicit },
			kind: 'create-one',
			schema: protectedPostNode,
		} as const

		await expect(
			resolveCreateOperationACL(
				operation,
				acl().config,
				undefined,
				context,
			),
		).rejects.toThrow(
			new TypeError(
				'Explicit ACL input requires acl({ resolveInput }) configuration',
			),
		)

		const accepted = await resolveCreateOperationACL(
			operation,
			acl({ resolveInput: ({ inputAcl }) => inputAcl }).config,
			undefined,
			context,
		)

		expect(accepted.input.acl).toBe(explicit)
	})
})
