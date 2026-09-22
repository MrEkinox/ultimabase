# Current plan: remove file-line budget exceptions

The user authorized repository-wide remediation on 2026-09-22. Keep the
production hard limit at 600 lines, set the test hard limit to 700 lines, and
retain the advisory warnings at 400/600. Split by existing responsibility;
never compress code or weaken tests merely to satisfy a count. Preserve all
public behavior, package exports, test assertions, coverage thresholds, and
generated-artifact exclusions.

Work through [milestone 32](issues/3200-file-line-budget-remediation/README.md)
in order. After each issue, run focused tests, audit the complete diff and
relevant API/coverage implications, correct findings, and repeat until the
audit is clean. Then make one dedicated local commit and report added/deleted
lines. Run the full validation and compare test counts and coverage before
marking the final issue complete. Never push without a separate request.

Stop and explain if a split requires an unapproved architecture change, loses
public behavior or coverage, or required validation cannot be completed.

Milestone 32 is complete. All six issues have dedicated local commits and their
handoffs record validation, audit corrections, line counts, and documentation
impact. No push has been requested.
