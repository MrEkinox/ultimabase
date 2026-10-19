Minimal reproduction: form N with EXACT method return types (no void loosening), two schemas whose
access rules cross to each other (B1.update -> B2, B2.read -> B1).
Run from forms/n-this-methods: ../../tsc -p attempts/repro-exact-both-directions
(node_modules -> ../exact-final/nm: the N lib with LooseRulesOf = RulesOf, i.e. exact returns.)
Expected: TS7022 on B1 and B2, TS7023 on the methods, TS7024, TS2615 (tsc-output.txt).
Remove B2.read's cross filter (return this.where.eq('name', 'x')): 0 errors.
