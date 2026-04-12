# W3 ASCII Screenshot Report

- Generated on: `2026-04-12T00:59:37.411Z`
- Default render source: `/Users/Zhuanz/bigbang/NextFrame/poc-render/D-napi-canvas/frame_t5.png`
- Output grid: `80x24`
- Root outputs:
  - `ascii-bw.txt`
  - `ascii-color.txt`
  - `ascii-silhouette.txt`

## Legibility

### Aurora Gradient

- Source: `/Users/Zhuanz/bigbang/NextFrame/poc-render/D-napi-canvas/frame_t5.png`
- Assessment: Readable as a smooth, layered gradient. Banding is visible, and the silhouette stays abstract as expected.
- Notes: Smooth color gradient with soft wave bands.

### Kinetic Headline

- Source: `/Users/Zhuanz/bigbang/NextFrame/poc-render/U-scene-gallery/frame_kineticHeadline.png`
- Assessment: The headline frame remains identifiable as text. Individual letters are blocky, but the word shapes survive at 80 columns.
- Notes: Text scene chosen to test letter-shape legibility.

### Generated Black Frame

- Source: `/Users/Zhuanz/bigbang/NextFrame/poc-render/W3-ascii-screenshot/generated-black-frame.png`
- Assessment: The black frame collapses to near-empty output, which is the expected result and makes empty scenes obvious.
- Notes: Synthetic all-black frame for the empty-frame case.

## File Sizes

### Aurora Gradient

- ascii-bw.txt: `1.94 KB` (1990 bytes)
- ascii-color.txt: `2.41 KB` (2466 bytes)
- ascii-silhouette.txt: `2.45 KB` (2506 bytes)

### Kinetic Headline

- ascii-bw.txt: `1.93 KB` (1974 bytes)
- ascii-color.txt: `2.35 KB` (2405 bytes)
- ascii-silhouette.txt: `1.94 KB` (1982 bytes)

### Generated Black Frame

- ascii-bw.txt: `1.90 KB` (1944 bytes)
- ascii-color.txt: `2.11 KB` (2160 bytes)
- ascii-silhouette.txt: `1.90 KB` (1944 bytes)

## Target Check

### Aurora Gradient

- ascii-bw.txt: under 5 KB target
- ascii-color.txt: under 5 KB target
- ascii-silhouette.txt: under 5 KB target

### Kinetic Headline

- ascii-bw.txt: under 5 KB target
- ascii-color.txt: under 5 KB target
- ascii-silhouette.txt: under 5 KB target

### Generated Black Frame

- ascii-bw.txt: under 5 KB target
- ascii-color.txt: under 5 KB target
- ascii-silhouette.txt: under 5 KB target

All generated outputs are below the 5 KB target in this run. ANSI stays small here because the color layer reuses the active ANSI code until the quantized color changes. The root files are copies of the default Aurora fixture.

## LOC

- Total LOC in this POC dir (index.js + package.json + report.md): `569`
- `425 index.js`
- `11 package.json`
- `133 report.md`
- `569 total`

## Sample Output

### Aurora Gradient BW Sample

```text
                                           .......:::::::::--::---:::::::::.....
                                         .......:::::-------------------:::::.:.
                                        ......:::::------============------:::::
                                      ......::::-----===+++++****++++====-----::
                        ..........  ......::::----====++***########**+++===----:
                   ......................:::----===+++**##%%%%@@@%##***++===----
                .....:::::::::::::.:.:::::----===++++**##%%@▓▓█▓@@@%##*+++====--
            ......::::-----------::::::-----====+++**###%@@@▓▓▓▓▓▓@%##**+++===--
       .........:::---=====+++===-----------==++++**##%%%@@@▓▓▓▓@@@%%##**+++==--
    ..........:::--====++*####**+============++***###%%%%@@@▓▓▓▓▓@%%%##**+++===-
..........:::::--===+++*##@@▓@%#*++========+++**###%%%%%@@@@▓@@@@%%%##***+++===-
.......::::::--===++***##%@@▓▓%%#**+=+===++++***###%%%%@@@@@@@@%%%%%##***++====-
......:::::----==++****##%%%%%##**++======+++**##%%%%%%@%%%@%%%%%%###***++===---
 .....:::::---===++************++++=========++*###%%%%%%%%#%#####****+++===----:
 ......:::::--==+***#****+++++++====------==++**##%%%%%%%####*****++++===----:::
  .....:::::--==+**#***+++=======------:---==++**##%%%###***++++++====----::::..
   ......::::--==+****++==--------::::::::--==++*##%%##***++=+====-----::::.....
    ......::::--=======----:::::::::::::::::--=+++*****+++====-----::::::.....  
     .......::::-------::::::............::::---==========-----::::::.....      
       ........:::::::::...................:::::---------:::::::::......        
           .................  .       .........::::::::::::.........            
               .........                 .......................                
                                             ..............
```

### Kinetic Headline BW Sample

```text
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                          :.▓▓.  ▓  ▓ *. █.█ *+.█.*.@                           
                            ▓@==▓ ▓ ▓ +  ▓ ▓▓ +..▓..@=
```

### Generated Black Frame BW Sample

```text
[all blank / empty frame]
```
