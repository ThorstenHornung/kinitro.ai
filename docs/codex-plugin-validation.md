# Codex plugin validation — 2026-10-14

Package: kinitro-ai-codex 0.1.0. Scope: config/skills package; no application/backend change.

## Package evidence

The managed script scripts/Test-CodexPlugin.ps1 ran against Codex CLI 0.162.0-alpha.17.2, with installation isolated from the user's Codex home. Counts from [JUnit XML](evidence/codex-plugin-package.junit.xml): **9 tests, 0 failures**.

It validates manifest resources, marketplace resolution, endpoint/client/callback consistency and the published public-client document. Counterprobes deliberately substitute a wrong MCP resource, Claude client ID and wrong listener port; each is rejected. Actual Codex marketplace add/plugin add succeeded; mcp list showed the enabled bundled kinitro_ai server at the correct resource. The installed client configuration matched the source.

The bundled skill-creator quick_validate.py also passed ("Skill is valid!"). This checks skill format, not authenticated platform behavior.

## Public live diagnosis

These are anonymous/read-only connection diagnostics, not MethOS scenario tests:

| Measurement | Result |
|---|---|
| Protected-resource and authorization metadata | HTTP 200; expected resource/issuer, PKCE S256, published clients and issuer-bound authorization |
| Anonymous MCP POST initialize | HTTP 401 with Bearer resource_metadata challenge |
| Standard public Codex client + variable callback port | HTTP 400, invalid_request, ID2043 redirect mismatch |
| Plugin-owned client document on delivery branch | HTTP 200; client_id equals fetch URL, exact callback 127.0.0.1:33419 |
| Plugin-owned client + exact callback + S256 | HTTP 302 to MethOS account/signin |

The last result proves that the fixed callback passes anonymous client/redirect validation. It does not prove token issuance, refresh, account permissions, tool access or briefing loading.

## Plan/contract/request comparison

| Requirement | Source | Measured result / remaining work |
|---|---|---|
| Codex package beside Claude | User request; plan steps 0–4; contract Package | Separate plugins/kinitro-ai-codex; Claude package/marketplace preserved |
| MethOS MCP first | User request; contract OAuth | Installed server discovered; public preflight reaches sign-in |
| Codex domain/briefing adaptation | Contract Skill; plan step 4 | kinitro skill; correct memory-instruction/memory-notes names and returned content-type check; account reads pending |
| Working fixed callback | Amended OAuth contract | Public metadata and 302 preflight verified; login needs free port 33419 |
| Validation with counterprobe | Plan step 5; contract Verification | 9/0 from JUnit, including 3 rejection counterprobes; CLI install passed |
| Live connected domain agent | Plan step 7 | OPEN: interactive login, current-seat, domain/agent/briefing reads |
| Repo publication | Plan step 8 | Package on codex/kinitro-ai-plugin; main publication needs approval; integration cannot create PRs |
| Claude lifecycle behavior | Contract Lifecycle | Explicitly excluded from 0.1.0; no automatic mirror/injection claim |
| Generic/native loopback provider fix | Follow-up request | Separate intake; no server change in this package |

The package is available for branch testing; no full connected-agent pass or main release is claimed.
