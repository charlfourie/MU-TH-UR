# Assistant handoff protocol

Use this instruction with GitHub Copilot, Claude, or another coding assistant in a repository that has a `.muthur/` handoff.

## Copyable instruction

```text
MU/TH/UR handoff protocol

Before starting work, read Charl's shared Crew Guidelines at
https://mu-th-ur.vercel.app/guidelines.html. They apply across repositories and
assistants. If the page is unavailable, follow the human's latest direct
instructions and ask when a decision depends on guidance you cannot verify.

For Charl's MU/TH/UR workflow, the latest successfully published dashboard
snapshot is the canonical handoff. The repository's `.muthur/` files are its
portable working copy and publish payload. At the start of a task, check the
latest dashboard snapshot when authenticated access is available, then read this
repository's `.muthur/state.md` and relevant recent `.muthur/activity.md`
entries. If the dashboard and local handoff disagree, reconcile the local files
to the dashboard before making a new update. If the dashboard cannot be checked,
ask the human for its current state instead of assuming the local copy is
authoritative. Inspect the code and follow repository-specific instructions.

When you complete a meaningful task or leave work in progress, maintain the
handoff before finishing:
- Update the current summary, status, and useful next steps.
- The `muthur update` command records the summary/status/next-step changes in
  the activity log. Use `muthur log` as well when the actual work or validation
  needs more detail than that automatic entry. Keep it concise; do not invent
  work or test results.
- Attribute your work as `copilot` when you are GitHub Copilot, `claude` when
  you are Claude, or `human` only when the human performed the work.
- Prefer the `muthur update` and `muthur log` commands. Preserve existing next
  steps; use `--clear-next` only when intentionally replacing the entire list.
- If the CLI is unavailable, follow the `.muthur/` format documented in the
  MU/TH/UR README and update both the YAML front matter and Markdown rendering.
- If no `.muthur/` handoff exists, ask before initializing one.

Never put credentials, tokens, private keys, or other sensitive material in
handoff files. After updating the local handoff, publish it and verify the
dashboard shows the new snapshot before calling the handoff complete. Publishing
is required for this workflow, not a separate optional action. If publish
credentials are unavailable, ask the user to publish through a protected local
prompt; never ask them to paste a publish token into chat. Do not commit or push
handoff changes unless the user asks.
```

## Typical end-of-task commands

Run these from the project repository after the CLI is installed, then publish
the updated snapshot:

```powershell
muthur update --actor copilot --status active --summary "Implemented the import flow and verified it with the focused tests" --next "Review the import error states"
muthur log --actor copilot --message "Added CSV import validation and tests; npm test passed."
```

Use `--actor claude` for Claude's work. Change the status and summary to reflect the actual project state. The `log` command is optional if the update's automatically recorded details are sufficient. The CLI's attribution is self-declared; it does not verify which assistant ran a command.

The protocol is intentionally opt-in and does not install itself into `CLAUDE.md`, `.github/copilot-instructions.md`, or other repository instructions. Copy the block into the instruction file appropriate for a project if you want it applied there.
