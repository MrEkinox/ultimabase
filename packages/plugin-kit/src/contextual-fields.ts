import {
	defineFieldOption,
	definePluginOutputDescriptor,
} from '@ultimabase/core'

/** Defines one contextual direct field option through Core's canonical factory. */
export const definePluginFieldOption: typeof defineFieldOption =
	defineFieldOption

/** Creates one owner-compatible output descriptor through Core's provenance boundary. */
export const defineOutputDescriptor: typeof definePluginOutputDescriptor =
	definePluginOutputDescriptor
