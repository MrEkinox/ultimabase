// The openings run a few at a time, in the order they came (D-277), in short
// turns of the event loop, those connected before those arriving (D-286).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Gate } from './gate.ts'

type Held = { readonly began: () => boolean; readonly done: () => void }

/** A task of `gate` that runs until it is told to end. */
const holding = (
	gate: Gate,
	ended?: Promise<void>,
): Held & { ran: Promise<string> } => {
	let began = false
	const { promise: release, resolve } = Promise.withResolvers<void>()
	return {
		began: () => began,
		done: resolve,
		ran: gate.run(async () => {
			began = true
			await (ended ?? release)
			return 'ran'
		}),
	}
}

const settled = async () => {
	await new Promise(setImmediate)
}

afterEach(() => {
	vi.useRealTimers()
})

describe('a gate', () => {
	it('runs up to its limit at once, the others in the order they came', async () => {
		const gate = new Gate(2)
		const tasks = Array.from({ length: 4 }, () => holding(gate))
		await settled()
		expect(tasks.map(({ began }) => began())).toEqual([
			true,
			true,
			false,
			false,
		])
		tasks[1]?.done()
		await settled()
		expect(tasks.map(({ began }) => began())).toEqual([true, true, true, false])
		tasks[0]?.done()
		await settled()
		expect(tasks.map(({ began }) => began())).toEqual([true, true, true, true])
		tasks[2]?.done()
		tasks[3]?.done()
		expect(await Promise.all(tasks.map(({ ran }) => ran))).toEqual([
			'ran',
			'ran',
			'ran',
			'ran',
		])
	})

	it('gives its turn back when a task fails', async () => {
		const gate = new Gate(1)
		const failing = gate.run(async () => {
			throw new Error('It broke.')
		})
		const next = holding(gate)
		await expect(failing).rejects.toThrow('It broke.')
		await settled()
		expect(next.began()).toBe(true)
		next.done()
		await next.ran
	})

	it('opens again once nothing runs', async () => {
		const gate = new Gate(1)
		await gate.run(async () => undefined)
		await gate.run(async () => undefined)
		const next = holding(gate)
		await settled()
		expect(next.began()).toBe(true)
		next.done()
		await next.ran
	})

	it('does not wait for a task that hangs past 5 s', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		const gate = new Gate(1)
		const hanging = holding(gate)
		const next = holding(gate)
		const last = holding(gate)
		await settled()
		expect(next.began()).toBe(false)
		vi.advanceTimersByTime(4999)
		await settled()
		expect(next.began()).toBe(false)
		vi.advanceTimersByTime(1)
		await settled()
		expect(next.began()).toBe(true)
		expect(last.began()).toBe(false)
		// The turn it gave back is not given twice when it ends after all.
		hanging.done()
		await hanging.ran
		await settled()
		expect(last.began()).toBe(false)
		next.done()
		await next.ran
		await settled()
		expect(last.began()).toBe(true)
		last.done()
		await last.ran
	})

	it('serves those connected before those arriving', async () => {
		const gate = new Gate(1)
		const order: string[] = []
		const named = (name: string) => async () => {
			order.push(name)
			await settled()
		}
		const all = [
			gate.arrive(named('first')),
			gate.arrive(named('arriving')),
			gate.run(named('connected')),
		]
		await Promise.all(all)
		expect(order).toEqual(['first', 'connected', 'arriving'])
	})

	it('gives those arriving one turn in 8, whatever else waits', async () => {
		const gate = new Gate(1)
		const order: string[] = []
		const named = (name: string) => async () => {
			order.push(name)
			await settled()
		}
		const all = [
			gate.run(named('first')),
			gate.arrive(named('arriving')),
			...Array.from({ length: 9 }, () => gate.run(named('connected'))),
		]
		await Promise.all(all)
		expect(order).toEqual([
			'first',
			...Array.from({ length: 7 }, () => 'connected'),
			'arriving',
			'connected',
			'connected',
		])
	})

	it('serves those connected when no one arrives on their turn', async () => {
		const gate = new Gate(1)
		const order: number[] = []
		const numbered = (number: number) => async () => {
			order.push(number)
			await settled()
		}
		const numbers = Array.from({ length: 10 }, (_, index) => index)
		await Promise.all(numbers.map((each) => gate.run(numbered(each))))
		expect(order).toEqual(numbers)
	})
})
