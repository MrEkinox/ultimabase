import { describe, expect, it, vi } from 'vitest'

import { runHookEffects, runHookTransformChain } from './composition.js'

describe('runtime hook composition', () => {
	it('feeds transform replacements forward while undefined preserves the value', async () => {
		const seen: number[] = []
		const result = await runHookTransformChain(
			['double', 'observe', 'increment'] as const,
			2,
			(handler, value) => {
				seen.push(value)

				if (handler === 'double') return value * 2
				if (handler === 'increment') return value + 1

				return undefined
			},
		)

		expect(seen).toStrictEqual([2, 4, 4])
		expect(result).toBe(5)
	})

	it('awaits each asynchronous transform before invoking the next', async () => {
		const trace: string[] = []
		const first = async (value: string): Promise<string> => {
			trace.push('first:start')
			await Promise.resolve()
			trace.push('first:end')

			return `${value}:first`
		}
		const second = (value: string): string => {
			trace.push('second')

			return `${value}:second`
		}

		const result = await runHookTransformChain(
			[first, second],
			'start',
			(handler, value) => handler(value),
		)

		expect(trace).toStrictEqual(['first:start', 'first:end', 'second'])
		expect(result).toBe('start:first:second')
	})

	it('executes asynchronous effects sequentially', async () => {
		const trace: string[] = []

		await runHookEffects(['first', 'second'] as const, async (handler) => {
			trace.push(`${handler}:start`)
			await Promise.resolve()
			trace.push(`${handler}:end`)
		})

		expect(trace).toStrictEqual([
			'first:start',
			'first:end',
			'second:start',
			'second:end',
		])
	})

	const shortCircuitCases = [
		[
			'transforms',
			(fail: () => never, later: () => void) =>
				runHookTransformChain(
					['fail', 'later'] as const,
					'initial',
					(handler, value) => {
						if (handler === 'fail') return fail()

						later()

						return value
					},
				),
		],
		[
			'effects',
			(fail: () => never, later: () => void) =>
				runHookEffects(['fail', 'later'] as const, (handler) => {
					if (handler === 'fail') return fail()

					later()
				}),
		],
	] as const satisfies readonly (readonly [
		string,
		(fail: () => never, later: () => void) => Promise<unknown>,
	])[]

	it.each(shortCircuitCases)(
		'short-circuits %s after the first failure',
		async (_name, run) => {
			const failure = new Error('hook failed')
			const later = vi.fn()
			const fail = (): never => {
				throw failure
			}

			await expect(run(fail, later)).rejects.toBe(failure)

			expect(later).not.toHaveBeenCalled()
		},
	)
})
