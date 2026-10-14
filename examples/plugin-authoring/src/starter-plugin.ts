//#region starter-plugin
import { contributeApplication, plugin } from '@ultimabase/core/plugin'

/** An inert definition: calling the factory connects, reads and starts nothing. */
export const starterPlugin = (instanceId?: string) =>
	plugin({
		id: 'community.starter',
		// The Core range you test; the pre-release packages are version 0.0.0.
		core: '^0.0.0',
		version: '1.0.0',
		...(instanceId === undefined ? {} : { instanceId }),
		contributions: [
			contributeApplication(() => ({
				exports: { ready: true as const },
			})),
		],
	})

export type StarterPlugin = ReturnType<typeof starterPlugin>
//#endregion starter-plugin
