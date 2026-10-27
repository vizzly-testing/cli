# Updating Vizzly

Vizzly lets you know when the CLI or your installed agent skill has an update.
In a terminal, it offers to apply the update now. Press Enter to skip it.
Saying yes applies that update only; future updates still need your okay.

## Update the CLI

Vizzly checks in the background at most once a day. If it finds a newer
version, you'll see a notice on your next command. Each version is announced
once.

When Vizzly can identify your npm or pnpm install, it shows the upgrade command
before asking. For other installs, update with your usual package manager.
Accepting a CLI upgrade also refreshes the Vizzly skill if you have it installed.

## Refresh the agent skill

Use the command that matches your setup:

```bash
pnpm exec vizzly init --agent-guidance # Skill and Vizzly's AGENTS.md note
pnpm exec vizzly init --agent-skill    # Skill only
```

These work even if Vizzly is already configured. Refreshing replaces edits
to the bundled skill files and, with `--agent-guidance`, Vizzly's note in
`AGENTS.md`. Your config, other instructions, and extra skill files stay as
they are. The skill reminder clears after a refresh.

## Turn off notices

Use `--no-update-notifier` for one command, or set
`VIZZLY_NO_UPDATE_NOTIFIER=1` to turn off checks and notices. Vizzly also
respects `NO_UPDATE_NOTIFIER`.

Checks and notices are off in CI, JSON output, piped commands, and at `warn`
or `error` log levels.
