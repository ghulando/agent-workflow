#!/bin/bash

set -e

for agent in claude codex pi; do
  pane=$(herdr agent list | jq -r \
    --arg agent "$agent" \
    '.result.agents[] | select(.agent == $agent) | .pane_id' \
    | head -1)

  if [ -n "$pane" ]; then
    herdr agent rename "$pane" "$agent" > /dev/null
  fi
done

herdr agent list | jq -r '.result.agents[] | "\(.name // "unnamed") (\(.agent))"'