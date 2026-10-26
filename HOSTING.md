# Remote SSH Plus — GUI prototype hosting

- Static files: `/workspace/rsp-prototype/` (`index.html`, `styles.css`, `app.js`)
- Local server: `npx serve -l 8765` (cwd = this directory)
- Public tunnel: `cloudflared tunnel --url http://127.0.0.1:8765`
- Design-only; does not touch `/workspace/remote-ssh-plus` or GitHub.
