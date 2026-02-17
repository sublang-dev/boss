<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Tmux Quick Reference

IterOn runs each agent session inside a tmux session within the container. This guide covers the most common tmux operations.

## Detach and Reattach

| Action | Keys / Command |
| --- | --- |
| Detach from session | `Ctrl-B D` |
| Reattach to session | `iteron open <workspace> <agent>` |

Detaching leaves the agent running in the background. Reattach at any time with the same `iteron open` command you used to start it.

## Clipboard (Copy & Paste)

The sandbox enables OSC 52 clipboard passthrough so text copied inside the container tmux session reaches the host system clipboard.

**How it works:** programs inside tmux emit an OSC 52 escape sequence → tmux forwards it to the host terminal emulator → the terminal writes to the system clipboard.

### Copying text

- **Copy mode:** `Ctrl-B [` to enter copy mode, select text with arrow keys, press `Enter` to copy.
- **Mouse:** select text with the mouse (mouse mode is enabled by default).

### Pasting text

Use your host terminal's paste shortcut:
- macOS: `Cmd-V`
- Linux / Windows: `Ctrl-Shift-V`

### Compatible terminals

Many modern terminals support OSC 52, including iTerm2, Windows Terminal, Alacritty, kitty, WezTerm, and foot. Support varies by terminal and version — check your terminal's documentation. If clipboard passthrough is blocked by your terminal or security settings, you can still select text with your terminal's native selection and copy with the usual shortcut.

### Disabling clipboard

Add to `~/.tmux.conf` inside the container:

```
set -g set-clipboard off
set -g allow-passthrough off
```

## Pane Splits

All tmux commands start with the prefix `Ctrl-B`:

| Action | Keys |
| --- | --- |
| Split horizontally | `Ctrl-B %` |
| Split vertically | `Ctrl-B "` |
| Switch to next pane | `Ctrl-B O` |
| Switch to pane by arrow | `Ctrl-B <Arrow>` |
| Close current pane | `Ctrl-B X` then `y` |
| Resize pane | `Ctrl-B Ctrl-<Arrow>` |

## Scrollback Navigation

| Action | Keys |
| --- | --- |
| Enter scroll mode | `Ctrl-B [` |
| Scroll up | `Up Arrow` or `Page Up` |
| Scroll down | `Down Arrow` or `Page Down` |
| Search backward | `Ctrl-R` (in scroll mode) |
| Exit scroll mode | `q` or `Escape` |

Mouse scrolling is enabled by default — scroll with your trackpad or mouse wheel.

## Session Management

| Action | Keys |
| --- | --- |
| List sessions | `Ctrl-B S` |
| Rename session | `Ctrl-B $` |
| Kill session | `Ctrl-B :` then `kill-session` |

## Default Configuration

The sandbox uses a two-tier tmux configuration:

1. **System config** (`/etc/tmux.conf`) — read-only defaults baked into the image:

```
set -g history-limit 10000
set -g default-terminal "tmux-256color"
set -g mouse on
set -g set-clipboard on
set -g allow-passthrough on
set -g status-left "[#{session_name}] "
set -g status-right "%H:%M %Y-%m-%d"
```

2. **User config** (`~/.tmux.conf`) — your overrides, persisted on the `iteron-data` volume.

tmux loads the system config first, then the user config. Any setting in `~/.tmux.conf` overrides the corresponding system default.

Key defaults:
- **10,000 lines** of scrollback history
- **256-color** terminal support
- **Mouse mode** enabled (click panes, scroll, resize)
- **Clipboard passthrough** enabled (OSC 52)
- **Status bar** shows session name and timestamp

## Custom Configuration

To add or override tmux settings, edit `~/.tmux.conf` inside the container:

```bash
iteron open ~
# Now in a shell inside the container:
vi ~/.tmux.conf
```

Changes persist across container restarts (stored on the `iteron-data` volume). To reload without restarting:

```bash
tmux source-file ~/.tmux.conf
```

System defaults in `/etc/tmux.conf` are restored automatically on image updates.
