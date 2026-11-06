# Game servers

Open **New tab > Game servers** to create and manage Minecraft Java servers.

## Where a server runs

- **This computer (process):** the app downloads the server, checks it against the published SHA-1 or SHA-256, and runs it with Java. If Java is missing, **Install Java 21** adds the Microsoft Build of OpenJDK in one click.
- **This computer (Docker):** a container from the `itzg/minecraft-server` image with a named data volume.
- **SSH host (process):** the server is downloaded and checked on the host and runs inside `tmux`. The host needs Java, tmux, curl and key-based SSH sign-in; the app uses BatchMode and never asks for or stores a password.
- **SSH host (Docker):** the same container, run on the host's Docker.

## Versions

Versions are read live from the official catalogs: Mojang's version manifest (every release, snapshot, pre-release and old alpha and beta), PaperMC's Fill API and Fabric's meta API. Filter by channel and search with plain text or the regex builder. Versions that Mojang published without a server download say so when you create one. If a catalog cannot be reached, the last good copy is shown and marked as offline.

You must accept the Minecraft EULA in the app before a server is created; only then is `eula=true` written.

## Managing a server

- Start, stop (graceful, forced after 30 seconds), restart, a live console with commands, and quick actions.
- Players: allowlist, operators, kick, ban and unban.
- **Server settings** for servers on this computer: typed switches, choices and numbers for difficulty, game mode, hardcore, PvP, online mode, allowlist, port, players, view and simulation distance, seed, world preset and more. Other settings already in the file are kept exactly as they are, and a `.bak` copy is written before each save.
- **Game rules** are read from the selected version's own data generator, so the list and types match that version exactly.
- **Back up the world** writes a `.7z` into the server's `backups` folder.
- **Remove server** passes the super confirmation and says exactly what it deletes.

## Generate a world area

The area defaults to 100 × 100 chunks around spawn. Drag the rectangle on the grid, use the arrow keys (Shift resizes), or type exact numbers. With the server running, the app generates the area in batches of up to 256 chunks with the vanilla `forceload` command, saves, and writes the world to a new folder or a ZIP in the place you chose with **Browse**. The written copy is checked (a `level.dat` for folders, an archive test for ZIPs). Nothing is overwritten.

## Limits

Typed settings, game rules, backups and area generation are available for servers on this computer. Servers on Docker or SSH hosts use the console and player controls. Bedrock servers are not offered yet. This feature has automated tests against real catalog data; a full run on a real Windows computer has not been recorded yet.
