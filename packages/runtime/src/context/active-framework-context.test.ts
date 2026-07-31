import { FrameworkApplication, FrameworkError } from '@ultimabase/core'
import { defineSchema, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationExecutor } from '../database/contracts.js'
import type { RequestTransactionRunner } from '../engine/framework-engine.js'
import { FrameworkEngine } from '../engine/framework-engine.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	getCurrentApplication,
	getCurrentApplicationEngine,
	getCurrentEngine,
	getCurrentFrameworkContext,
	getCurrentRequest,
	runWithRequestEngine,
} from './active-framework-context.js'
import { requestSources } from './request-context.js'

const articleSchema = defineSchema({
	className: 'ScopedArticle',
	fields: { title: stringField() },
})

const unusedDatabaseOperation: DatabaseOperationExecutor = {
	// Scope tests never execute an operation, so a rejected promise is exhaustive.
	execute: () => Promise.reject(new Error('Unexpected fixture execution')),
}

/** Builds explicit neutral stages without hiding the real Runtime pipeline. */
const createPipeline = (): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		clp: () => undefined,
		acl: (input) => input.accessConstraints,
		fieldPermissions: (input) => ({
			operation: input.operation,
			accessConstraints: input.accessConstraints,
		}),
		globalBeforeHooks: (input) => input.operation,
		schemaBeforeHooks: (input) => input.operation,
		databaseOperation: unusedDatabaseOperation,
		schemaAfterHooks: (input) => input.result,
		globalAfterHooks: (input) => input.result,
		commit: () => undefined,
		postCommitEvents: () => undefined,
	}

	return new RuntimePipeline(stages)
}

/** Retains the request engine until adapter-backed transactions are implemented. */
const transactionRunner: RequestTransactionRunner = async (engine, handler) =>
	handler(engine)

/** Creates an isolated application engine for one focused scope test. */
const createFramework = (): FrameworkEngine<
	readonly [typeof articleSchema],
	readonly []
> =>
	new FrameworkEngine({
		application: new FrameworkApplication({
			schemas: [articleSchema],
			plugins: [],
		}),
		pipeline: createPipeline(),
		transactionRunner,
	})

const expectMissingContext = (readCurrentValue: () => unknown): void => {
	expect(readCurrentValue).toThrow(
		new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No RequestEngine is active in the current asynchronous scope.',
			{ publicMessage: 'No request execution context is available.' },
		),
	)
}

describe('active framework context', () => {
	it('fails every contextual helper outside an active request scope', () => {
		for (const readCurrentValue of [
			getCurrentFrameworkContext,
			getCurrentEngine,
			getCurrentApplicationEngine,
			getCurrentApplication,
			getCurrentRequest,
		]) {
			expectMissingContext(readCurrentValue)
		}
	})

	it('derives one consistent immutable context from the explicit request engine', () => {
		const framework = createFramework()
		const requestEngine = framework.user('user-1', {
			requestId: 'scope-1',
			source: requestSources.internal,
		})

		const result = runWithRequestEngine(requestEngine, () => {
			const context = getCurrentFrameworkContext()

			expect(context.application).toBe(requestEngine.application)
			expect(context.frameworkEngine).toBe(framework)
			expect(context.requestEngine).toBe(requestEngine)
			expect(context.request).toBe(requestEngine.context)
			expect(getCurrentApplication()).toBe(requestEngine.application)
			expect(getCurrentApplicationEngine()).toBe(framework)
			expect(getCurrentEngine()).toBe(requestEngine)
			expect(getCurrentRequest()).toBe(requestEngine.context)
			expect(Object.isFrozen(context)).toBe(true)

			return 'scoped' as const
		})

		expect(result).toBe('scoped')
		expectMissingContext(getCurrentEngine)
	})

	it('restores a parent scope after nested execution and thrown callbacks', () => {
		const framework = createFramework()
		const parent = framework.anonymous({
			requestId: 'parent-1',
			source: requestSources.rest,
		})
		const child = framework.user('user-2', {
			requestId: 'child-1',
			source: requestSources.graphql,
		})
		const callbackError = new Error('nested failure')

		runWithRequestEngine(parent, () => {
			expect(getCurrentEngine()).toBe(parent)

			runWithRequestEngine(child, () => {
				expect(getCurrentEngine()).toBe(child)
			})

			expect(getCurrentEngine()).toBe(parent)
			expect(() =>
				runWithRequestEngine(child, () => {
					throw callbackError
				}),
			).toThrow(callbackError)
			expect(getCurrentEngine()).toBe(parent)
		})

		expectMissingContext(getCurrentEngine)
	})

	it.concurrent(
		'never leaks engines between parallel asynchronous chains',
		async () => {
			const firstFramework = createFramework()
			const secondFramework = createFramework()
			const firstEngine = firstFramework.user('user-1', {
				requestId: 'parallel-1',
				source: requestSources.rest,
			})
			const secondEngine = secondFramework.user('user-2', {
				requestId: 'parallel-2',
				source: requestSources.graphql,
			})
			const firstEntered = Promise.withResolvers<undefined>()
			const secondEntered = Promise.withResolvers<undefined>()

			const [firstObserved, secondObserved] = await Promise.all([
				runWithRequestEngine(firstEngine, async () => {
					firstEntered.resolve(undefined)
					await secondEntered.promise
					await Promise.resolve()

					return getCurrentEngine()
				}),
				(async () => {
					await firstEntered.promise

					return runWithRequestEngine(secondEngine, async () => {
						secondEntered.resolve(undefined)
						await Promise.resolve()

						return getCurrentEngine()
					})
				})(),
			])

			expect(firstObserved).toBe(firstEngine)
			expect(secondObserved).toBe(secondEngine)
			expect(firstObserved.application).not.toBe(secondObserved.application)
			expectMissingContext(getCurrentEngine)
		},
	)

	it('rejects malformed JavaScript scope boundaries', () => {
		const requestEngine = createFramework().anonymous({
			requestId: 'boundary-1',
			source: requestSources.internal,
		})

		expect(() => {
			// @ts-expect-error -- Runtime validation protects JavaScript engines.
			runWithRequestEngine({}, () => undefined)
		}).toThrow(new TypeError('Active context engine must be a RequestEngine'))
		expect(() =>
			// @ts-expect-error -- Runtime validation protects JavaScript callbacks.
			runWithRequestEngine(requestEngine, undefined),
		).toThrow(new TypeError('Active context callback must be a function'))
	})
})
