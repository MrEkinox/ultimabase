// The change feed (D-154): what each commit changed, to the plugins that
// take it. The adapter feeds nothing when none does.
import type { Feed } from './adapter.ts'
import type { PluginRecord } from './definition.ts'
import { inOrder, type Installed } from './plugin-app.ts'

/** Calls each plugin's `changed` and `missed`, in declaration order. */
export function feedOf(
	records: readonly PluginRecord[],
	plugins: readonly Installed[],
): Feed | undefined {
	const takers = inOrder(records, plugins).filter(
		({ code }) => code.changed !== undefined,
	)
	if (takers.length === 0) return undefined
	// A plugin failing on a change must not stop the others nor the write.
	const each = (hook: 'changed' | 'missed', args: readonly unknown[]): void => {
		for (const { code, context } of takers) {
			const run = code[hook]
			if (run === undefined) continue
			try {
				Reflect.apply(run, undefined, [...args, context])
			} catch (error) {
				context.logger.error({ err: error }, `The plugin's ${hook} failed.`)
			}
		}
	}
	return {
		changed: (changes) => each('changed', [changes]),
		missed: () => each('missed', []),
	}
}
