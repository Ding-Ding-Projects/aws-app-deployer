# One-click setup

**Install missing tools** installs AWS CLI v2 and Docker Desktop without opening any download page.

## How it works
- It tries Windows Package Manager first, silently.
- If that is missing or fails, it downloads the publisher's installer from `awscli.amazonaws.com` or `desktop.docker.com`, checks the Authenticode signature, and deletes the file without running it if the signature is wrong.
- It installs silently, then refreshes PATH so the tools are found.

## Problems it fixes
- Interrupted downloads resume and retry up to 3 times.
- WSL not ready for Docker is enabled and updated.
- Docker installed but stopped is started, and the app waits for its engine.

Windows asks for your permission once. The app never answers that prompt. If you decline it, or a company policy blocks the installer, the app says exactly which.
