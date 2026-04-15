// Provides example invocations for CLI help output.
const lines = (text: string) => text.trim().split("\n").map((line: string) => line.trim()).filter(Boolean);
const examples = (name: string, text: string) => [name, lines(text)];

export const COMMAND_EXAMPLES = Object.fromEntries([
  examples("new", `
    nextframe new intro.json --duration=8 --width=1080 --height=1920
    nextframe new /tmp/demo.json --fps=24 --json
  `),
  examples("validate", `
    nextframe validate demo ep01 intro
    nextframe validate ./timeline.json --json
  `),
  examples("build", `
    nextframe build demo ep01 intro
    nextframe build ./timeline.json -o ./dist/intro.html
  `),
  examples("scenes", `
    nextframe scenes
    nextframe scenes headline --json
  `),
  examples("preview", `
    nextframe preview demo ep01 intro --times=0,3,5
    nextframe preview ./timeline.json --auto --out=/tmp/preview
  `),
  examples("frame", `
    nextframe frame demo ep01 intro 3.5
    nextframe frame ./timeline.json 00:03.5 ./frame.png --width=1080 --height=1920
  `),
  examples("render", `
    nextframe render demo ep01 intro --target=ffmpeg
    nextframe render ./timeline.json ./intro.mp4 --target=recorder --crf=18
  `),
  examples("wysiwyg", `
    nextframe wysiwyg diff ./timeline.json --t=3.5
    nextframe wysiwyg simulate ./timeline.json --layer=2 move 120 60 --json
  `),
  examples("wysiwyg diff", `
    nextframe wysiwyg diff ./timeline.json --t=3.5
    nextframe wysiwyg diff ./timeline.json --t=00:03.5 --json
  `),
  examples("wysiwyg simulate", `
    nextframe wysiwyg simulate ./timeline.json --layer=2 move 120 60
    nextframe wysiwyg simulate ./timeline.json --layer=1 edit-text "New title" --json
  `),
  examples("match", `
    nextframe match plan e01 --rule scene-per-segment
    nextframe match validate ./timeline.json --json
    nextframe match preview ./narration-plan.json --seg 3
  `),
  examples("match plan", `
    nextframe match plan e01 --rule scene-per-segment
    nextframe match plan e01 --rule ducking --json
  `),
  examples("match validate", `
    nextframe match validate demo ep01 intro
    nextframe match validate ./timeline.json --json
  `),
  examples("match preview", `
    nextframe match preview ./narration-plan.json --seg 3
    nextframe match preview ./timeline.json --seg 1 --json
  `),
  examples("layer-list", `
    nextframe layer-list demo ep01 intro
    nextframe layer-list ./timeline.json --json
  `),
  examples("layer-add", `
    nextframe layer-add demo ep01 intro headline --id=hero --start=0 --dur=5 --params={"text":"Hello"}
    nextframe layer-add ./timeline.json videoWindow --start=4 --dur=6 --x=60% --y=8% --w=32% --h=28%
  `),
  examples("layer-move", `
    nextframe layer-move demo ep01 intro hero --start=2.5
    nextframe layer-move ./timeline.json hero --start=2.5 --json
  `),
  examples("layer-resize", `
    nextframe layer-resize demo ep01 intro hero --dur=4
    nextframe layer-resize ./timeline.json hero --dur=4 --json
  `),
  examples("layer-set", `
    nextframe layer-set demo ep01 intro hero opacity=0.7 x=10% y=20%
    nextframe layer-set ./timeline.json hero --params={"text":"Updated","subtitle":"Now"}
  `),
  examples("layer-remove", `
    nextframe layer-remove demo ep01 intro hero
    nextframe layer-remove ./timeline.json hero --json
  `),
  examples("project-new", `
    nextframe project-new series
    nextframe project-new series --root=/tmp/NextFrameProjects --json
  `),
  examples("project-list", `
    nextframe project-list
    nextframe project-list --root=/tmp/NextFrameProjects --json
  `),
  examples("project-config", `
    nextframe project-config series --get
    nextframe project-config series --set theme={"accent":"#ff6a00"} --json
  `),
  examples("episode-new", `
    nextframe episode-new series alpha
    nextframe episode-new series alpha --root=/tmp/NextFrameProjects --json
  `),
  examples("episode-list", `
    nextframe episode-list series
    nextframe episode-list series --json
  `),
  examples("segment-new", `
    nextframe segment-new series alpha intro --duration=12 --width=1080 --height=1920
    nextframe segment-new series alpha intro --root=/tmp/NextFrameProjects --json
  `),
  examples("segment-list", `
    nextframe segment-list series alpha
    nextframe segment-list series alpha --json
  `),
  examples("pipeline-get", `
    nextframe pipeline-get series alpha
    nextframe pipeline-get series alpha --stage=atoms --json
  `),
  examples("script-set", `
    nextframe script-set series alpha --segment=1 --narration="Problem" --visual="Show chart"
    nextframe script-set series alpha --segment=2 --narration="Solution" --arc=["setup","payoff"] --json
  `),
  examples("script-get", `
    nextframe script-get series alpha
    nextframe script-get series alpha --segment=1 --json
  `),
  examples("audio-set", `
    nextframe audio-set series alpha --segment=1 --status=generated --duration=6.4 --file=audio/seg1.wav
    nextframe audio-set series alpha --segment=2 --status=draft --duration=5.1 --sentences=[{"start":0,"end":1.2}] --json
  `),
  examples("audio-get", `
    nextframe audio-get series alpha
    nextframe audio-get series alpha --segment=1 --json
  `),
  examples("audio-synth", `
    nextframe audio-synth series alpha episode-01 --segment=1 --voice=Xiaoxiao
    nextframe audio-synth series alpha episode-01 --segment=2 --backend=volcengine --json
  `),
  examples("atom-add", `
    nextframe atom-add series alpha --type=component --name="Hero chart" --scene=barChartReveal --segment=1 --params={"value":42}
    nextframe atom-add series alpha --type=video --name="B-roll" --file=clips/broll.mp4 --duration=4.2 --json
  `),
  examples("atom-list", `
    nextframe atom-list series alpha
    nextframe atom-list series alpha --type=video --json
  `),
  examples("atom-remove", `
    nextframe atom-remove series alpha --id=3
    nextframe atom-remove series alpha --id=3 --json
  `),
  examples("output-add", `
    nextframe output-add series alpha --name="intro-v1" --file=exports/intro.mp4 --duration=12 --size=1920x1080
    nextframe output-add series alpha --name="intro-v2" --file=exports/intro-v2.mp4 --duration=12 --size=1080x1920 --changes="portrait pass" --json
  `),
  examples("output-list", `
    nextframe output-list series alpha
    nextframe output-list series alpha --json
  `),
  examples("output-publish", `
    nextframe output-publish series alpha --id=2 --platform=youtube
    nextframe output-publish series alpha --id=2 --platform=reels --json
  `),
  examples("source-download", `
    nextframe source-download series alpha --url https://www.youtube.com/watch?v=abc
    nextframe source-download series alpha --url https://example.com/video --format 1080 --json
  `),
  examples("source-transcribe", `
    nextframe source-transcribe series alpha --source my-source
    nextframe source-transcribe series alpha --source my-source --model small.en --lang en --json
  `),
  examples("source-align", `
    nextframe source-align ~/NextFrame/library/my-source --srt ./subs/my-source.srt
    nextframe source-align ./sources/my-source --srt ./subs/my-source.srt --lang en
  `),
  examples("source-cut", `
    nextframe source-cut series alpha --source my-source --plan ./cut-plan.json
    nextframe source-cut series alpha --plan ./cut-plan.json --margin 0.1 --json
  `),
  examples("source-list", `
    nextframe source-list --library ~/NextFrame/library
    nextframe source-list --library ./sources
  `),
  examples("source-link", `
    nextframe source-link ~/NextFrame/library/my-source --project series --episode alpha
    nextframe source-link ./sources/my-source --project series --episode alpha --root /tmp/NextFrameProjects
  `),
  examples("app", `
    nextframe app status
    nextframe app navigate demo ep01 intro
    nextframe app eval --help
  `),
  examples("app eval", `
    nextframe app eval "document.title"
    nextframe app eval "window.location.pathname" --timeout=2000 --json
  `),
  examples("app screenshot", `
    nextframe app screenshot
    nextframe app screenshot --out=/tmp/editor.png --json
  `),
  examples("app diagnose", `
    nextframe app diagnose
    nextframe app diagnose --json
  `),
  examples("app navigate", `
    nextframe app navigate demo ep01 intro
    nextframe app navigate demo --view=project --json
  `),
  examples("app click", `
    nextframe app click 320 240
    nextframe app click 640 120 --json
  `),
  examples("app status", `
    nextframe app status
    nextframe app status --json
  `),
  examples("app-pipeline", `
    nextframe app-pipeline status
    nextframe app-pipeline navigate --project=demo --episode=ep01
    nextframe app-pipeline tab --help
  `),
  examples("app-pipeline navigate", `
    nextframe app-pipeline navigate --project=demo --episode=ep01
    nextframe app-pipeline navigate --project=demo --json
  `),
  examples("app-pipeline tab", `
    nextframe app-pipeline tab --tab=atoms
    nextframe app-pipeline tab --tab=output --json
  `),
  examples("app-pipeline status", `
    nextframe app-pipeline status
    nextframe app-pipeline status --json
  `),
  examples("app-pipeline play", `
    nextframe app-pipeline play --segment=2
    nextframe app-pipeline play --segment=2 --json
  `),
  examples("app-pipeline stop", `
    nextframe app-pipeline stop
    nextframe app-pipeline stop --json
  `),
  examples("app-eval", `
    nextframe app-eval "document.title"
    nextframe app-eval "window.location.pathname" --json
  `),
  examples("app-screenshot", `
    nextframe app-screenshot
    nextframe app-screenshot --out=/tmp/editor.png --json
  `),
  examples("describe-frame", `
    nextframe describe-frame timeline.json --time=3.5
    nextframe describe-frame timeline.json --time=0 --json
  `),
  examples("scene-new", `
    nextframe scene-new myBackground --ratio=16:9 --category=backgrounds
    nextframe scene-new interviewTitle --ratio=9:16 --category=overlays --tech=dom
  `),
  examples("scene-preview", `
    nextframe scene-preview darkGradient
    nextframe scene-preview interviewBg --ratio=9:16
  `),
  examples("scene-validate", `
    nextframe scene-validate darkGradient
    nextframe scene-validate interviewBg --ratio=9:16 --json
  `),
]);
