# Password Authentication documentation refresh

User-approved scope: make the Password Authentication guide linear, easier to
navigate, and consistent with the recently delivered authentication APIs.

## Delivered

- Lead with a complete server-side journey: define AppUser, install the plugin,
  sign up, log in, use the session, refresh, and log out.
- Use one required displayName field throughout server, REST, GraphQL, and
  cookie examples; keep login limited to username and password.
- Group transport configuration and examples into independent REST, GraphQL,
  and browser-cookie sections. Explain the current cookie response separately.
- Move detailed configuration and migration notes after the primary journey.
- Explain readable-profile authorization and rollback before transport usage.
- Use a mobile-friendly troubleshooting list and align the documentation-plan
  outcome with the rewritten guide.

Documentation impact: both.

The public guide and its editorial metadata changed; this internal handoff
records verification. The package README remains accurate because no public
API, behavior, configuration contract, or security semantics changed.

## Scope audit

No runtime or transport change. Cookie endpoints still return their existing
principal pointer and session metadata without a raw token or User profile.
The cookie configuration example now supplies the existing required browser
policy maxAgeSeconds option, found by compiling the documented examples.
Unrelated local website configuration changes are excluded from the commit.

## Validation

- Website TypeScript, ESLint, and production build passed.
- The six assembled TypeScript example files compiled against package exports
  with zero diagnostics; all six JSON examples parsed successfully.
- Website content validation: 65 of 66 tests passed. The sole failure checks
  the LAN address in next.config.mjs: an unrelated local edit changes it from
  192.168.1.135 to 192.168.1.88, while its existing test expects the former.
- All 56 existing browser tests passed across eight files.
- After the final content edits, all 11 focused plugin, guide, and
  security content tests passed, and the production build passed again.
- Desktop/light and mobile/dark rendering returned HTTP 200 without client
  errors or page overflow. Desktop accessibility checks passed. Mobile checks
  identified shared dark-theme contrast issues in the sticky navigation and
  syntax-highlighted comments; those are outside this content-only change.
  Configuration reference and troubleshooting tables were replaced with lists.

No changes were pushed.
