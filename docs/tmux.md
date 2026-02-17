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

The sandbox enables OSC 52 clipboard passthrough (`set-clipboard on`, `allow-passthrough on`) so that mouse-drag and copy-mode selections reach the host system clipboard automatically. This works on terminals that support OSC 52, including iTerm2, WezTerm, Alacritty, kitty, and Windows Terminal.

### OSC 52 terminals (iTerm2, WezTerm, Alacritty, kitty, etc.)

Mouse drag copies automatically:

1. **Drag** to select text.
2. **Release** — copied to host clipboard.
3. **Paste** with `Cmd-V` (macOS) or `Ctrl-Shift-V` (Linux/Windows).

Keyboard copy mode also works: `Ctrl-B [`, select with arrow keys, `Enter` to copy.

### Terminal.app (no OSC 52 support)

Terminal.app does not support OSC 52. Use the mouse-mode toggle to do native selection:

1. `Ctrl-B m` — turn mouse mode **off** (global; affects all IterOn tmux sessions in this container).
2. **Drag** to select text, `Cmd-C` to copy.
3. `Ctrl-B m` — turn mouse mode **on** again.
4. **Paste** with `Cmd-V`.

### Disabling clipboard passthrough

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
bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-selection-and-cancel
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-selection-and-cancel
bind-key m if-shell -F '#{mouse}' 'set -g mouse off; display-message "Mouse off"' 'set -g mouse on; display-message "Mouse on"'
set -g status-left "[#{session_name}] "
set -g status-right "%H:%M %Y-%m-%d"
```

2. **User config** (`~/.tmux.conf`) — your overrides, persisted on the `iteron-data` volume.

tmux loads the system config first, then the user config. Any setting in `~/.tmux.conf` overrides the corresponding system default.

Key defaults:
- **10,000 lines** of scrollback history
- **256-color** terminal support
- **Mouse mode** enabled (click panes, scroll, resize)
- **Clipboard passthrough** enabled (OSC 52 for compatible terminals)
- **Mouse drag copy** — drag to select, release to copy
- **Mouse toggle** — `Ctrl-B m` to toggle mouse mode (for Terminal.app copy)
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
