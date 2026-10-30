// A plugin and the field type it provides: a color, stored as its `#rrggbb`
// text, read by code as `{ red, green, blue }`, and sent to clients as
// `#rrggbb`.
//#region plugin
import type { PluginOf, PluginTypes } from 'ultimabase'
import { defineFieldType, definePlugin } from 'ultimabase'
import { z } from 'zod'

// The plugin that provides the field type, which `plugins` lists.
export interface Color extends PluginTypes {
	readonly name: 'color'
}

export const colorPlugin: PluginOf<Color> = definePlugin<Color>({
	name: 'color',
	manifest: {
		name: 'example-color',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
}).plugin
//#endregion

//#region field-type
const Hex = z.string().regex(/^#[0-9a-f]{6}$/, 'A color is #rrggbb.')
const Rgb = z.object({
	red: z.int().min(0).max(255),
	green: z.int().min(0).max(255),
	blue: z.int().min(0).max(255),
})
export type Rgb = z.infer<typeof Rgb>

const rgbOf = (hex: string): Rgb => ({
	red: Number.parseInt(hex.slice(1, 3), 16),
	green: Number.parseInt(hex.slice(3, 5), 16),
	blue: Number.parseInt(hex.slice(5, 7), 16),
})
const hexOf = ({ red, green, blue }: Rgb): string =>
	`#${[red, green, blue].map((n) => n.toString(16).padStart(2, '0')).join('')}`

/** `color({ palette })` takes only the colors of its palette. */
type ColorOptions = { readonly palette?: readonly string[] }

export const color = defineFieldType({
	plugin: 'color',
	options: ['palette'],
	stored: (f) => f.string(),
	decode: (stored) => rgbOf(stored),
	encode: (value) => hexOf(value),
	// What a write takes: `{ red, green, blue }`, or its `#rrggbb`.
	schema: ({ palette }: ColorOptions) =>
		z
			.union([Rgb, Hex.transform(rgbOf)])
			.refine(
				(value) => palette === undefined || palette.includes(hexOf(value)),
				'This color is not in the palette.',
			),
	toJSON: (value) => hexOf(value),
	shape: Hex,
})
//#endregion
