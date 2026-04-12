# W2 ASCII Gantt Report

## Renderer LOC

- `index.js`: `441` LOC

## 80-Column Fit

- Yes. The renderer keeps each emitted line at or under `80` JavaScript characters.
- In normal monospace terminals the output fits comfortably.
- One caveat: tools that count UTF-8 bytes instead of display cells will report a larger number because `┃`, `┼`, and `▓` are multibyte characters.

## Visual Check

- Ran `node test.js`
- Output was print-clean and readable line by line.
- The main readability decision was to render one clip span per sub-row inside a track group, with the clip label on the right. That avoids label collisions when long background clips overlap shorter overlays.

## Generated Gantts

### Simple

```text
NextFrame Project · 0:30.0 · 3 tracks · 6 clips · 3 chapters
          intro                   body                outro
     ┃              ┃                              ┃          ┃
     0:00     0:06  0:09  0:12  0:15 0:18  0:21  0:24 0:27 0:30
     ├─────┼────┼─────┼─────┼─────┼────┼─────┼─────┼────┼─────┤
V1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ aurora
               ▓▓▓▓▓▓▓▓▓▓▓▓                                     headline
                                ▓▓▓▓▓▓▓▓▓                       chart
                                                    ▓▓▓▓▓▓▓▓▓   lowerThird
V2                               ▓▓▓▓                           overlay
A1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ narration.mp3
                                             ▲                  punch-line ma...
```

### Complex

```text
Launch Sequence Multi-Track Stres... · 1:22.0 · 6 tracks · 13 clips · 5 chapters
     cold...  problem        product demo       proof     cta
     ┃     ┃            ┃                    ┃         ┃        ┃
     0:00 0:10   0:20    0:30   0:40   0:50   1:00   1:10    1:22
     ├──────┼──────┼───────┼──────┼──────┼──────┼──────┼───────┼┤
V1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ bgAurora
V2       ▓▓▓▓▓▓▓▓▓                                                heroTitle
                          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓                          uiCapture
                                               ▓▓▓▓▓▓             metricsWall
         ▲                                                        hook
V3               ▓▓▓▓▓▓▓▓                                         featureBullets
                                      ▓▓▓▓▓                       zoomCut
                                                        ▓▓▓▓▓▓▓   ctaCard
                            ▲                                     feature turn
A1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ narrationA.wav
                                               ▲                  proof beat
A2   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ musicBed.wav
                                                         ▲        cta push
A3         ▓▓                                                     sfxHits
                       ▓▓                                         sfxHits
                                             ▓                    sfxHits
                                                        ▓▓        sfxHits
```

### Edge Cases

```text
Edge Cases Flat Clip Input · 0:07.4 · 3 tracks · 6 clips · 3 chapters
       boot           flash                       tail
     ┃       ┃                      ┃                              ┃
     0:00.0        0:02.0  0:03.0   0:04.0  0:05.0  0:06.0    0:07.4
     ├───────┼────────┼───────┼────────┼───────┼───────┼────────┼──┤
V1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ bg
                                                                   ▲ last frame
V2    ▓▓▓▓▓▓                                                         flashTitle
               ▓▓▓                                                   tinyBadge
                                                      ▓▓▓▓▓▓▓▓▓▓▓    tailNote
      ▲                                                              cold start
A1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                   vox
                                                              ▓▓▓▓▓  stinger
MARK                                ▲                                global sync
```

## Concerns For LLM Legibility

- Clip labels are truncated aggressively on the right when names are long. The time span remains clear, but the semantic label may need a lookup against the source JSON.
- Dense tick marks are easier to parse than dense tick labels. The renderer therefore shows more ruler ticks than textual labels.
- Very marker-heavy tracks will grow vertically because markers render on their own rows for clarity.
- The chart is optimized for line-by-line reading, not exact frame-accurate measurement. It is good for planning and inspection, not as a substitute for numeric timing data.
