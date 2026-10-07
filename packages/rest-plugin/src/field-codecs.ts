import {
	definePluginFieldWireProtocol,
	type PluginFieldWireCodec,
	type PluginFieldWireProtocol,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** @internal Shares REST v1 field compatibility without exporting Runtime behavior. */
export const restFieldProtocol: PluginFieldWireProtocol<
	'ultimabase.rest',
	'1.0.0'
> = definePluginFieldWireProtocol({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

/** Defines one plugin field's exact logical-to-REST-v1 JSON boundary. */
export const restFieldCodec = <TValue>(options: {
	readonly decode: (value: unknown) => TValue
	readonly encode: (value: TValue) => unknown
}): PluginFieldWireCodec<TValue> => {
	if (
		!isPlainRecord(options) ||
		typeof options.decode !== 'function' ||
		typeof options.encode !== 'function'
	) {
		throw new TypeError('REST field codec requires decode and encode functions')
	}

	return immutableRecord({
		decode: options.decode,
		encode: options.encode,
		format: 'json' as const,
		protocol: restFieldProtocol,
	})
}
