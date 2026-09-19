// Shared application declaration support; this file executes no type-test assertions.
import type {
	FieldValidationCompatibility,
	FieldValidationOption,
} from '../../src/options.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly validation?: FieldValidationOption<this>
	}

	interface UltimaBaseGeneratedFieldOptionCompatibility<
		TOptions extends object,
		TValue,
	> {
		readonly validation: FieldValidationCompatibility<TOptions, TValue>
	}
}
