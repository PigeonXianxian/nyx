#!/bin/bash
# Start Claude Code in a detached tmux session with the companion channel loaded,
# and click through the prompts newer Claude Code shows for development channels.
# Usage: start-channel.sh <tmux-session> <folder> <mcp-config> [model-id or model-file]
#   folder      where your companion's CLAUDE.md (persona + rules) lives
#   mcp-config  a JSON like mcp.example.json that registers this channel as "companion"
# Part of the Nyx relay (modified Tidal Echo), GNU AGPL v3.
S=$1; DIR=$2; CFG=$3; MODEL=${4:-}
# model may be an id or a file holding one (e.g. the relay's data dir "model", set from the chat page)
[ -f "$MODEL" ] && MODEL=$(tr -cd 'A-Za-z0-9._:/-' < "$MODEL")
[[ "$MODEL" == /* ]] && [ ! -f "$MODEL" ] && MODEL=""   # no pick saved yet: leave the model to Claude Code
[ -n "$S" ] && [ -d "$DIR" ] && [ -f "$CFG" ] || { echo "usage: $0 <session> <folder> <mcp-config> [model]"; exit 2; }
M=""; [ -n "$MODEL" ] && M="--model $MODEL"
# NYX_RESUME=<session id> goes back to an old window (the relay sets it when you pick one in the gauge)
R=""; [ -n "${NYX_RESUME:-}" ] && R="--resume $(tr -cd 'A-Za-z0-9-' <<<"$NYX_RESUME")"
# NYX_KEYS_FILE = the relay's agent-keys.env (keys set from the gauge). The window is told where it is and to load it
# inside the one command that needs a key, so values never reach the chat, a command line or its output, and a changed
# key needs no restart. The relay sets it for New window; for boot, add
#   Environment=NYX_KEYS_FILE=/path/to/relay/agent-keys.env   to the systemd unit.
P=""
if [ -n "${NYX_KEYS_FILE:-}" ]; then
  KQ=$(printf %q "$NYX_KEYS_FILE")
  P="--append-system-prompt $(printf %q "API keys the user saved from the app are in $NYX_KEYS_FILE (NAME='value' lines; it may change while you run). When a command needs one, load the file inside that same command: set -a; . $KQ; set +a; your-command ... \$NAME. To see which names exist: grep -oE '^[A-Z_][A-Z0-9_]*' $KQ. Never print, echo, cat or log the values, and never paste them into the chat.")"
fi
# effort and permission mode picked in the chat page's gauge for this window, kept next to the model file (effort_now, mode_pick)
E=""; PM=auto
if [[ "${4:-}" == /* ]]; then D=$(dirname "$4")
  EV=$([ -f "$D/effort_now" ] && tr -cd 'a-z' < "$D/effort_now"); [[ "$EV" =~ ^(low|medium|high|xhigh|max)$ ]] && E="--effort $EV"
  MV=$([ -f "$D/mode_pick" ] && tr -cd 'A-Za-z' < "$D/mode_pick"); [[ "$MV" =~ ^(default|acceptEdits|plan|auto)$ ]] && PM=$MV
fi
# an npm install whose postinstall didn't run leaves a `claude` that only prints an error; the real binary is in its platform package
CL=claude
if ! claude --version >/dev/null 2>&1; then
  for c in "$(dirname "$(readlink -f "$(command -v claude)")")"/../node_modules/@anthropic-ai/claude-code-*/claude; do [ -x "$c" ] && CL=$c && break; done
fi
# workdir (next to the model file): the window runs there instead of in $DIR — e.g. /root, the folder VS Code opens, so the
# page and VS Code share one list of sessions and either can carry on the other's. Then $DIR/CLAUDE.md (the persona) and the
# keys note are handed over as one appended system prompt, with a word on how the page works.
WD="$DIR"
if [[ "${4:-}" == /* ]] && [ -f "$(dirname "$4")/workdir" ]; then W=$(head -1 "$(dirname "$4")/workdir"); [ -d "$W" ] && WD=$W; fi
if [ "$WD" != "$DIR" ]; then
  PF="$(dirname "$4")/.window-prompt.md"
  { [ -f "$DIR/CLAUDE.md" ] && cat "$DIR/CLAUDE.md" && echo
    echo "How this window is reached: the person reads this whole session on the Nyx web page (and may open it in VS Code too). What they write there arrives as an ordinary prompt, and your ordinary replies are what they read, so just answer normally in text; the reply tool is not needed for that. <channel> blocks are automatic notes from the app (a new window's hand-over, the context line, the kitchen); answer them in text too."
    [ -n "${NYX_KEYS_FILE:-}" ] && echo && echo "API keys the user saved from the app are in $NYX_KEYS_FILE (NAME='value' lines; it may change while you run). When a command needs one, load the file inside that same command: set -a; . $NYX_KEYS_FILE; set +a; your-command ... \$NAME. To see which names exist: grep -oE '^[A-Z_][A-Z0-9_]*' $NYX_KEYS_FILE. Never print, echo, cat or log the values, and never paste them into the chat."
  } > "$PF"
  P="--append-system-prompt-file $(printf %q "$PF")"
fi
cd "$WD" || exit 1
tmux new-session -d -s "$S" -x 200 -y 50 "$CL --dangerously-load-development-channels server:companion --mcp-config $CFG --permission-mode $PM $M $E $R $P" || exit 1
for i in $(seq 1 30); do
  sleep 2
  pane=$(tmux capture-pane -pt "$S" 2>/dev/null) || exit 1
  if grep -q "I am using this for local development" <<<"$pane"; then tmux send-keys -t "$S" Enter
  elif grep -q "Yes, I trust this folder" <<<"$pane"; then tmux send-keys -t "$S" Down Enter   # the folder is the one set up for it (workdir)
  elif grep -q "Try the new fullscreen renderer" <<<"$pane"; then tmux send-keys -t "$S" Down Enter
  elif grep -qE "(auto|plan|manual) mode on|accept edits on" <<<"$pane" && ! grep -q "Enter to confirm" <<<"$pane"; then exit 0
  fi
done
echo "Claude Code didn't settle in 60s — run: tmux attach -t $S"; exit 1
