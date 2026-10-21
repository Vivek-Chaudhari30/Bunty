# app-name

Copy this folder to start a new integration (one app = one folder = one Vellum plugin):
`cp -R integrations/_template integrations/<app-name>`, then rename `name` in `package.json`.
How plugins work: `vellum/plugins/README.md` and `vellum/skills/plugin-builder/`.

- **What it does:** one or two lines.
- **Secrets it needs:** names only (also add them to `.env.example`). Store values with
  `assistant credentials prompt --service <app-name> --field <field>`.
- **How to test:** install with `cp -R integrations/<app-name> "$VELLUM_WORKSPACE_DIR/plugins/<app-name>"`,
  check `assistant plugins list` shows `ok`, then the steps to try it with your own number.

Folders (add only the ones you need; the loader skips missing ones):
`tools/` one file per tool, `skills/` SKILL.md files, `schedules/` recurring jobs,
`routes/` HTTP endpoints, `channels/ingress.json` for webhooks, `mcp.json` for an MCP server,
`src/` shared helper code (not loaded directly).
