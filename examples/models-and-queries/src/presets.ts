// The app's own field presets, shared by its models.
//#region preset
import type { StringOptions } from 'ultimabase'
import { z } from 'zod'

/** A text stored trimmed, never blank, of at most `max` characters. */
export const text = ({ max = 255 }: { readonly max?: number } = {}) =>
	({
		validate: z
			.string()
			.trim()
			.min(1, 'Never blank.')
			.max(max, `At most ${max} characters.`),
	}) satisfies StringOptions
//#endregion
