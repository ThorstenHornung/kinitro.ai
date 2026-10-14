# MethOS connection in Codex

The bundled endpoint is https://methos.kinitro.ai/mcp. Its OAuth client ID is this plugin's public client metadata URL https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json. It uses callback http://127.0.0.1:33419/callback and listener port 33419, declared consistently in the plugin and its metadata. It does not reuse Claude's client ID.

Authenticate the plugin-provided kinitro_ai server in Codex's MCP connection UI; a plugin-qualified name may be shown. Start a new conversation after installing, then invoke the kinitro skill.

For a standalone CLI connection (an alternative to the plugin, not a duplicate server):

```powershell
codex mcp add kinitro_ai --url https://methos.kinitro.ai/mcp --oauth-client-id https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json
codex -c 'mcp_servers.kinitro_ai.oauth.callback_url="http://127.0.0.1:33419/callback"' -c 'mcp_servers.kinitro_ai.oauth.callback_port=33419' mcp login kinitro_ai --scopes methos,offline_access
```

Codex owns PKCE, callback listener, token storage and renewal. Never ask for pasted tokens. Public discovery advertises published client metadata and issuer-bound authorization, but not DCR or token auth method none. Explicitly naming the published Codex client avoids assuming automatic registration works. Successful sign-in still depends on provider acceptance and user consent.

For invalid-client/redirect errors, preserve the error and displayed client/redirect for diagnosis. Do not change MethOS auth registration, copy Claude credentials, disable issuer validation or suggest token workarounds.

Tools absent: check installation, authentication and new-conversation activation. An approved domain without a default agent is a platform setup gap. Missing briefing is a separate gap, not an initialized session.

See the [repository guide](https://github.com/ThorstenHornung/kinitro.ai/blob/main/docs/codex-plugin.md).

### Fixed callback constraint

Login needs free local port 33419. Do not run two logins at once. If the port is occupied, stop and report the conflict; changing only the listener breaks the registered callback. Once signed in, regular MCP calls do not use the callback listener. The generic Codex client with a dynamic callback remains incompatible until the separate provider fix is implemented.
