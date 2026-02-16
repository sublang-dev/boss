<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Tmux Quick Reference

IterOn runs each agent session inside a tmux session within the container. This guide covers the most common tmux operations.

## Detach and Reattach

| Action | Keys / Command |
| --- | --- |
| Detach from session | `Ctrl-B D` |
| Reattach to session | `iteron open <agent> <workspace>` |

Detaching leaves the agent running in the background. Reattach at any time with the same `iteron open` command you used to start it.

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

The sandbox ships with this tmux config (`~/.tmux.conf`):

```
# Scrollback history
set -g history-limit 10000

# Terminal
set -g default-terminal "screen-256color"

# Mouse support
set -g mouse on

# Status bar
set -g status-left "[#{session_name}] "
set -g status-right "%H:%M %Y-%m-%d"
```

Key defaults:
- **10,000 lines** of scrollback history
- **256-color** terminal support
- **Mouse mode** enabled (click panes, scroll, resize)
- **Status bar** shows session name and timestamp

## Custom Configuration

To override the default tmux config, create or edit `~/.tmux.conf` inside the container:

```bash
iteron open
# Now in a shell inside the container:
vi ~/.tmux.conf
```

Changes persist across container restarts (stored on the `iteron-data` volume). To reload without restarting:

```bash
tmux source-file ~/.tmux.conf
```
