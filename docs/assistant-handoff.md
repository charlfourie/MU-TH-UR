# Assistant handoff protocol

Use this instruction with GitHub Copilot, Claude, or another coding assistant in a repository that has a `.muthur/` handoff.

## Copyable instruction

```text
MU/TH/UR handoff protocol

At the start of a task, if this repository has `.muthur/state.md`, read it and the
most recent relevant entries in `.muthur/activity.md`. Treat them as orientation,
not as proof that the described code or plan is still current; inspect the code
and follow the repository's own instructions.

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
handoff files. Do not publish a snapshot unless the user explicitly asks.
Publishing is a separate action; never ask the user to paste a publish token
into chat. Do not commit or push handoff changes unless the user asks.
```

## Typical end-of-task commands

Run these from the project repository after the CLI is installed:

```powershell
muthur update --actor copilot --status active --summary "Implemented the import flow and verified it with the focused tests" --next "Review the import error states"
muthur log --actor copilot --message "Added CSV import validation and tests; npm test passed."
```

Use `--actor claude` for Claude's work. Change the status and summary to reflect the actual project state. The `log` command is optional if the update's automatically recorded details are sufficient. The CLI's attribution is self-declared; it does not verify which assistant ran a command.

The protocol is intentionally opt-in and does not install itself into `CLAUDE.md`, `.github/copilot-instructions.md`, or other repository instructions. Copy the block into the instruction file appropriate for a project if you want it applied there.
