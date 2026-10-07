import { expectTypeOf, test } from 'vitest'

import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
} from '../../access/index.js'
import type { CapabilityToken } from '../../plugins/capabilities.js'
import type {
	CreateOneOperationAst,
	FindManyOperationAst,
} from '../../query/operations/contracts.js'
import type { OperationResult } from '../../query/operations/results.js'
import { type SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from './application-request-execution.js'
import { UltimaBase } from './ultima-base.js'

declare const executor: ApplicationRequestExecutor
declare const read: FindManyOperationAst<SchemaDefinition>
declare const mutation: CreateOneOperationAst<SchemaDefinition>

const MutationSchema = UltimaBase.Schema.define({
	className: 'ApplicationRequestMutationType',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

test('retains exact request sources, contexts, and callback results', async () => {
	const anonymous = executor.createAnonymousContext({
		requestId: 'request-1',
		source: 'fixture-http',
	})
	expectTypeOf(anonymous).toEqualTypeOf<
		RequestContext<AnonymousRequestAccess, 'fixture-http'>
	>()

	const synchronous = executor.runWithContext(anonymous, (context) => ({
		requestId: context.requestId,
		source: context.source,
	}))
	expectTypeOf(synchronous).toEqualTypeOf<{
		requestId: string
		source: 'fixture-http'
	}>()

	const asynchronous = executor.runWithContext(anonymous, async () => {
		await Promise.resolve()
		return 1 as const
	})
	expectTypeOf(asynchronous).toEqualTypeOf<Promise<1>>()

	const readResult = executor.executeRead(anonymous, read)
	expectTypeOf(readResult).toEqualTypeOf<
		Promise<OperationResult<typeof read>>
	>()
	// @ts-expect-error -- the transport facade executes only normalized schema reads.
	void executor.executeRead(anonymous, mutation)

	const created = executor.executeMutation(anonymous, MutationSchema, {
		kind: 'create-one',
		input: { data: { title: 'Created' } },
	})
	expectTypeOf(created).toEqualTypeOf<Promise<object>>()
	const updated = executor.executeMutation(anonymous, MutationSchema, {
		kind: 'update-one',
		input: {
			id: '01991f00-0000-7000-8000-000000000001',
			data: { title: 'Updated' },
		},
	})
	expectTypeOf(updated).toEqualTypeOf<Promise<object | null>>()
	const bulk = executor.executeMutation(anonymous, MutationSchema, {
		kind: 'create-many',
		input: { data: [{ title: 'First' }, { title: 'Second' }] },
	})
	expectTypeOf(bulk).toEqualTypeOf<Promise<readonly object[]>>()
	// @ts-expect-error -- singular updates require one exact target.
	void executor.executeMutation(anonymous, MutationSchema, {
		kind: 'update-one',
		input: { data: { title: 'Missing target' } },
	})

	const master = await executor.verifyMasterKey({
		context: anonymous,
		rawKey: 'raw-key',
		reason: 'Fixture verification',
	})
	expectTypeOf(master).toEqualTypeOf<
		RequestContext<MasterRequestAccess, 'fixture-http'>
	>()
	void executor.verifyMasterKey({
		// @ts-expect-error -- verified Master authority is inherited, not re-verified.
		context: master,
		rawKey: 'raw-key',
		reason: 'x',
	})

	// @ts-expect-error -- raw credentials must be strings.
	void executor.verifyMasterKey({ context: anonymous, rawKey: 1, reason: 'x' })
	void executor.verifyMasterKey({
		context: anonymous,
		rawKey: 'raw-key',
		reason: 'x',
		// @ts-expect-error -- authority selection cannot enter verification options.
		useMasterKey: true,
	})
})

test('exports one exact single application-lifetime protocol', () => {
	expectTypeOf(applicationRequestExecutionCapability).toEqualTypeOf<
		CapabilityToken<
			ApplicationRequestExecutor,
			ApplicationRequestExecutor,
			'ultimabase.application-request-execution',
			'1.0.0',
			'single',
			'application'
		>
	>()
})
