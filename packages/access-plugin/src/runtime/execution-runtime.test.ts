import { UltimaBase } from '@ultimabase/core'

import { describe, expect, it } from 'vitest'

import { AccessExecutionRuntime } from './execution-runtime.js'
import type { AccessExecutionDescriptor } from './execution-runtime.js'
import {
	RequestContext,
	type ApplicationCallbackExecutor,
} from '@ultimabase/core/plugin'

const schema = UltimaBase.Schema.define({
	className: 'AttributedAccessRule',
	fields: (field) => ({ title: field.string() }),
})
const context = RequestContext.anonymous({
	requestId: 'attributed-access-rule',
	source: 'internal',
})

const createDescriptor = (
	source: AccessExecutionDescriptor['identity']['rule']['source'],
): AccessExecutionDescriptor => ({
	identity: {
		branch: 'read',
		phase: 'access-operation',
		rule: { rule: () => true, source },
		ruleIndex: 0,
		schema,
	},
	operation: 'find-many',
})

describe('AccessExecutionRuntime', () => {
	it('reattributes developer and contributed plugin rules exactly', async () => {
		const trace: string[] = []
		const callbacks: ApplicationCallbackExecutor = {
			runApplication: (callback) => {
				trace.push('owner:application')
				return callback()
			},
			runPlugin: (owner, callback) => {
				trace.push(`owner:${owner.pluginId}:${owner.instanceId ?? 'default'}`)
				return callback()
			},
		}
		const runtime = new AccessExecutionRuntime(undefined, callbacks)

		await runtime.invoke(
			createDescriptor({ kind: 'developer' }),
			context,
			async () => {
				await Promise.resolve()
				trace.push('callback:developer')
			},
		)
		await runtime.invoke(
			createDescriptor({
				kind: 'plugin',
				localName: 'role-policy',
				ownerInstanceId: 'worker',
				ownerPlugin: 'fixture.access-provider',
				targetKind: 'schema',
			}),
			context,
			() => {
				trace.push('callback:plugin')
			},
		)

		expect(trace).toStrictEqual([
			'owner:application',
			'callback:developer',
			'owner:fixture.access-provider:worker',
			'callback:plugin',
		])
	})
})
