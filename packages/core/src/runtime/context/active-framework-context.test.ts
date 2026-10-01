import { applicationFixture } from '../../../tests/application-fixture.js'
import { FrameworkError } from '../../foundation.js'
import { FrameworkApplication } from '../../application/framework-application.js'

import { describe, expect, it } from 'vitest'

import type { DatabaseOperationExecutor } from '../database/contracts.js'
import { FrameworkEngine } from '../engine/framework-engine.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	getCurrentEngine,
	getCurrentRequest,
	runWithRequestEngine,
} from './active-framework-context.js'
import { requestSources } from './request-context.js'
import { getCurrentUltimaBase } from './current-ultima-base.js'
import { UltimaBase } from '../application/ultima-base.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'ScopedArticle',
	fields: (field) => ({ title: field.string() }),
})

const unusedDatabaseOperation: DatabaseOperationExecutor = {
	// Scope tests never execute an operation, so a rejected promise is exhaustive.
	execute: () => Promise.reject(new Error('Unexpected fixture execution')),
}

/** Builds only the stages required by a policy-free Runtime pipeline. */
const createPipeline = (): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		finalMutationValidation: (input) => input.operation,
		databaseOperation: unusedDatabaseOperation,
		commit: () => undefined,
	}

	return new RuntimePipeline(stages)
}

/** Creates an isolated application engine for one focused scope test. */
const createFramework = async (): Promise<
	FrameworkEngine<readonly [typeof articleSchema], readonly []>
> =>
	new FrameworkEngine({
		application: await applicationFixture(
			new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
		).initialize(),
		pipeline: createPipeline(),
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
	it('fails request helpers and the application fallback without an owner', () => {
		for (const readCurrentValue of [getCurrentEngine, getCurrentRequest]) {
			expectMissingContext(readCurrentValue)
		}
		expect(getCurrentUltimaBase).toThrow(
			new FrameworkError(
				'MISSING_EXECUTION_CONTEXT',
				'No initialized active UltimaBase application is available.',
				{ publicMessage: 'No application execution context is available.' },
			),
		)
	})

	it('derives every focused contextual value from the explicit request engine', async () => {
		const framework = await createFramework()
		const requestEngine = framework.anonymous({
			requestId: 'scope-1',
			source: requestSources.internal,
		})

		const result = runWithRequestEngine(requestEngine, () => {
			expect(getCurrentEngine()).toBe(requestEngine)
			expect(getCurrentRequest()).toBe(requestEngine.context)
			// Low-level frameworks must not select an unrelated facade implicitly.
			expect(getCurrentUltimaBase).toThrow('no owning UltimaBase facade')

			return 'scoped' as const
		})

		expect(result).toBe('scoped')
		expectMissingContext(getCurrentEngine)
	})

	it('restores a parent scope after nested execution and thrown callbacks', async () => {
		const framework = await createFramework()
		const parent = framework.anonymous({
			requestId: 'parent-1',
			source: 'fixture.parent',
		})
		const child = framework.anonymous({
			requestId: 'child-1',
			source: 'fixture.child',
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

	it('never leaks engines between parallel asynchronous chains', async () => {
		const firstFramework = await createFramework()
		const secondFramework = firstFramework
		const firstEngine = firstFramework.anonymous({
			requestId: 'parallel-1',
			source: 'fixture.first',
		})
		const secondEngine = secondFramework.anonymous({
			requestId: 'parallel-2',
			source: 'fixture.second',
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
		expect(firstObserved).not.toBe(secondObserved)
		expectMissingContext(getCurrentEngine)
	})

	it('rejects malformed JavaScript scope boundaries', async () => {
		const requestEngine = (await createFramework()).anonymous({
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
