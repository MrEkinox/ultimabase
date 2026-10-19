# Scratch evidence

- `bisect/` + `lib2/`: 50-schema ring, fields only, with the target constraint `() => void`
  in `lib2/core.ts` -> `RangeError: Maximum call stack size exceeded` in tsc.
  Replace it with `object | string` in `lib2/core.ts` and it compiles.
- `hkt/b.ts`: intersection of `this`-typed plugin HKT interfaces -> TS2589.
- `single/a.ts`: single-object `define` on one schema: S1 (no NoInfer) OK, S3 (NoInfer +
  callback fields) reproduces ADR-0280's bootstrap-schema errors, S2/S4 OK.
- `a-builder/`: variant A without object-literal filters still yields `RelationField<() => any>`.
- `toggle.py <gen-dir> <options>` / `toggle2.py <gen-dir> <expr>`: per-option and per-expression
  check-time bisection used to find the contextual return-type inference cost.
- Section 9: `rtoggle.py <gen-dir> <options>` (per-option bisection without usage.ts),
  `tracefiles.cjs <trace-dir>` (per-file check time from `--generateTrace`), `profsum.cjs <cpuprofile-dir>`
  (self time per TypeScript function), `dts/` (variant d9-registry probed against emitted `.d.ts`).
- Section 10: `ftoggle.py <gen-dir> <methods>` drops chained calls from a generated F app and reports check time.
