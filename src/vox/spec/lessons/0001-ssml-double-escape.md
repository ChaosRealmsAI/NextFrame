# Lesson 0001: Avoid SSML Double Escaping

## Problem

Edge synthesis broke when text was treated as already-escaped XML in one layer and escaped again in another. Inputs containing `&`, `<`, `>`, quotes, or apostrophes were the failure trigger.

## Where It Showed Up

- Chunk sizing lives in [src/backend/edge/ssml.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ssml.rs).
- Final SSML payload construction happens in [src/backend/edge/ssml.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ssml.rs).
- The websocket sender in [src/backend/edge/ws.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ws.rs) passes raw chunk text into `build_ssml`.

## Root Cause

The system needs escaped-length accounting for the Edge payload limit, but escaped-length accounting is not the same thing as pre-escaping the text. When those responsibilities were blurred, text could become `&amp;amp;` or `&amp;lt;`.

## Current Rule

- `clean_text` may sanitize unsupported control characters.
- `split_text` may calculate escaped byte cost.
- `build_ssml` is the only place allowed to escape XML characters.

This rule is locked in by [spec/adr/0001-edge-ssml-escaping.md](/Users/Zhuanz/boom/vox/spec/adr/0001-edge-ssml-escaping.md) and tested in [src/backend/edge/ssml.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ssml.rs).

## Preventive Practice

- Pass plain text across backend boundaries until the final SSML serialization step.
- When changing chunking logic, test both byte-limit behavior and spoken-text fidelity.
- Keep a regression test with mixed characters such as `AT&T <tag> 'quote' "double"`.
