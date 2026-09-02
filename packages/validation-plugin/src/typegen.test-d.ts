import type {
	FieldValidationCompatibility,
	FieldValidationOption,
} from './options.js'

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
