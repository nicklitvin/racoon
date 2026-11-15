#!/bin/bash
# Turns Swift compiler errors in a build log into GitHub annotations, so they show on the
# commit's checks. Up to 10 annotations a step, each carrying a batch of errors.
# Usage: annotate.sh build.log "title"
log="$1"
title="${2:-Swift build}"
root="${GITHUB_WORKSPACE:-$PWD}/"
errors=$(grep -E '^/.*:[0-9]+:[0-9]+: error: ' "$log" | sed "s#^$root##" | sort -u)
[ -z "$errors" ] && { grep -E 'error:' "$log" | head -40 | sed 's/^/::error title='"$title"'::/' ; exit 0; }
count=$(echo "$errors" | wc -l | tr -d ' ')
echo "$count error(s)"
# Ten batches at most, each as one annotation (newlines escaped as %0A).
per=$(( (count + 9) / 10 ))
echo "$errors" | split -l "$per" - /tmp/errs.
for f in /tmp/errs.*; do
  first=$(head -1 "$f")
  file=$(echo "$first" | cut -d: -f1)
  line=$(echo "$first" | cut -d: -f2)
  body=$(sed -e 's/%/%25/g' "$f" | awk '{printf "%s%%0A", $0}')
  echo "::error file=$file,line=$line,title=$title ($count errors)::$body"
done
rm -f /tmp/errs.*
