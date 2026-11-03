# CLI authentication

Sign in once with `vizzly login`, choose permissions in the browser, and select the checkout's
upload destination with `vizzly project link`. The login performs authorized actions as you;
linking saves a destination without issuing another token.

## Permissions

The browser can reduce the requested permissions. `vizzly whoami` reports the actual grant.

| Scope | What it permits |
| --- | --- |
| `read` | Browse projects, builds, comparisons, images, previews, and baselines |
| `builds:write` | Create builds, upload screenshots and previews, and finalize uploads |
| `reviews:write` | Accept or reject visual changes |
| `comments:write` | Post comments |

Scopes are independent. A build-only session can upload to an explicitly bound project without
read permission. The API also checks your current membership and project access for every action. Preview upload checks project visibility by default, which also needs
`read`; a build-only caller can explicitly acknowledge public-link access with
`vizzly preview <path> --build <id> --public-link`.

```sh
vizzly login --scopes read
vizzly login --scopes 'read builds:write'
vizzly login --no-browser
vizzly whoami --json
```

Omitting `--scopes` uses the server's normal developer permission request. Browser consent decides
the actual grant. Missing permission returns `INSUFFICIENT_SCOPE` with the required and granted
scope names. Authorize additional permissions with a new login; refreshing cannot expand consent.

## Credential selection

An explicit `--token`, `VIZZLY_TOKEN`, or config token is authoritative. Otherwise the saved login
wins over an implicit cached project credential. Cloud reads accept `--auth user` to deliberately
use the saved account and `--auth token` to inspect the automation credential. An unavailable
selected login never silently changes identity.

Project tokens remain suitable for CI. Their project context is checked against a configured
binding before uploads. User uploads send the checkout's qualified project selector; the server
validates it. `project status` distinguishes configuration, credential source, granted upload
permission, and verified versus unverified access. Binding a name alone does not prove access.

## Storage and refresh

Credentials are isolated by API origin and `VIZZLY_HOME`. On macOS, the default home uses Keychain
when available; its JSON record contains metadata rather than tokens. Other platforms and custom
homes use an owner-only file. `VIZZLY_AUTH_STORAGE=file|keychain|auto` selects storage explicitly.
A record pointing to an unavailable Keychain entry fails closed instead of reading stale file data.

Access tokens renew automatically near expiry and once after a permitted read receives 401.
Concurrent processes sharing a session serialize rotation and reread the saved successor before
refreshing. A local kernel-held lock releases if its owning process exits. Long-running commands
can renew in later expiry windows. Generic writes are not replayed after an authentication failure;
review decisions retain their explicit server-deduplicated command-ID retry policy.

`vizzly logout` revokes the selected origin's session and clears its local credentials. Other
origins and independently authorized logins remain separate. Network and storage errors report
recovery steps without pretending that you signed out. Old unscoped global credentials are not
silently upgraded; complete a new login to grant permissions.
