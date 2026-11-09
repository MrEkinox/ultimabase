// The change feed (D-154): what each commit changed, to the kernel's
// completed callers (D-332) and to the plugins that take it. The adapter
// feeds nothing when none does.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Feed } from './adapter.ts'
import type { PluginRecord } from './definition.ts'
import { inOrder, type Installed } from './plugin-app.ts'

// Outside every async context: an adapter may deliver from within the write,
// whose transaction and recording a hook's queries must not join.
const outside = AsyncLocalStorage.snapshot()

/** Logs a plugin's hook failing, thrown or rejected: nothing awaits it. */
export const guarded =
	({ logger }: Installed['context'], hook: string) =>
	(err: unknown): void =>
		logger.error({ err }, `The plugin's ${hook} failed.`)

/**
 * Calls the kernel's `own` feed, then each plugin's `changed`, `lost` and
 * `missed`, in declaration order.
 */
export function feedOf(
	records: readonly PluginRecord[],
	plugins: readonly Installed[],
	own?: Feed,
): Feed | undefined {
	const takers = inOrder(records, plugins).filter(
		({ code }) => code.changed !== undefined,
	)
	if (takers.length === 0 && own === undefined) return undefined
	// A plugin failing on a change must not stop the others nor the write.
	const each = (hook: keyof Feed, args: readonly unknown[]): void => {
		for (const { code, context } of takers) {
			const run = code[hook]
			if (run === undefined) continue
			try {
				const result = outside((): unknown =>
					Reflect.apply(run, undefined, [...args, context]),
				)
				if (result instanceof Promise) result.catch(guarded(context, hook))
			} catch (error) {
				guarded(context, hook)(error)
			}
		}
	}
	return {
		changed: (changes) => {
			own?.changed(changes)
			each('changed', [changes])
		},
		lost: () => {
			own?.lost()
			each('lost', [])
		},
		missed: () => {
			own?.missed()
			each('missed', [])
		},
	}
}
