#!/bin/bash
# Fail if any .rs source file exceeds 500 lines (test files excluded)
MAX=500
FAIL=0

while IFS= read -r line; do
    count=$(echo "$line" | awk '{print $1}')
    file=$(echo "$line" | awk '{print $2}')

    # skip test files and poc directories
    case "$file" in
        */tests.rs|*/tests/*.rs|*/poc*) continue ;;
    esac

    if [ "$count" -gt "$MAX" ]; then
        echo "FAIL: $file ($count lines > $MAX)"
        FAIL=1
    fi
done < <(find . -name '*.rs' -not -path '*/target/*' -not -path '*/.worktrees/*' -exec wc -l {} + | grep -v total)

if [ "$FAIL" -eq 0 ]; then
    echo "OK: all .rs files under $MAX lines"
fi
exit $FAIL
