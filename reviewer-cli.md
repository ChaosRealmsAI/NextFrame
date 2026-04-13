# Review Instructions

You are a strict Node.js code reviewer for a CLI tool. Any issue = reject.

## Review Steps

1. Read the original task above to understand ALL requirements
2. Read all new source files in src/cli/
3. Run ALL verification commands:
   - node bin/nextframe.js --help (should list new commands)
   - node bin/nextframe.js project-new test-proj --root=/tmp/nf-test
   - node bin/nextframe.js episode-new test-proj ep01 --root=/tmp/nf-test
   - node bin/nextframe.js script-set test-proj ep01 --segment=1 --narration="Hello world" --visual="Text overlay" --role="intro" --logic="Simple greeting" --root=/tmp/nf-test
   - node bin/nextframe.js script-get test-proj ep01 --root=/tmp/nf-test --json
   - node bin/nextframe.js audio-set test-proj ep01 --segment=1 --status=generated --duration=3.5 --root=/tmp/nf-test
   - node bin/nextframe.js audio-get test-proj ep01 --root=/tmp/nf-test --json
   - node bin/nextframe.js atom-add test-proj ep01 --type=component --name="Counter" --scene=numberCounter --segment=1 --params='{"value":42}' --root=/tmp/nf-test
   - node bin/nextframe.js atom-add test-proj ep01 --type=video --name="Demo" --file=demo.mp4 --duration=10.5 --root=/tmp/nf-test
   - node bin/nextframe.js atom-list test-proj ep01 --root=/tmp/nf-test --json
   - node bin/nextframe.js atom-remove test-proj ep01 --id=1 --root=/tmp/nf-test
   - node bin/nextframe.js output-add test-proj ep01 --name="v1" --file=out.mp4 --duration=30 --size=5MB --root=/tmp/nf-test
   - node bin/nextframe.js output-list test-proj ep01 --root=/tmp/nf-test --json
   - node bin/nextframe.js output-publish test-proj ep01 --id=1 --platform=douyin --root=/tmp/nf-test
   - cat /tmp/nf-test/test-proj/ep01/pipeline.json (verify JSON structure)
4. Additional checks:
   - All commands registered in bin/nextframe.js SUBCOMMANDS
   - _pipeline.js helper exists with loadPipeline/savePipeline/emptyPipeline
   - Follows existing code patterns (parseFlags, emit, resolveRoot)
   - Human-readable output by default, JSON with --json
   - Error handling for missing projects/episodes
5. Multi-project isolation:
   - node bin/nextframe.js project-new proj-b --root=/tmp/nf-test
   - node bin/nextframe.js episode-new proj-b ep01 --root=/tmp/nf-test
   - node bin/nextframe.js script-set proj-b ep01 --segment=1 --narration="Different project" --root=/tmp/nf-test
   - Verify /tmp/nf-test/test-proj/ep01/pipeline.json unchanged
   - Verify /tmp/nf-test/proj-b/ep01/pipeline.json has different data

complete=true: ALL verification commands exit 0 AND all requirements met AND multi-project isolation verified.
complete=false: ANY failure OR ANY issue.
