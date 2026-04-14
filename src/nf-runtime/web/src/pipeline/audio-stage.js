// Pipeline audio stage renderer for generated narration, karaoke timing, and segment playback.
function renderPipelineAudio(data) {
  const voice = escHtml(data.audio.voice);
  const speed = data.audio.speed;
  const segments = data.audio.segments;
  const scriptSegments = data.script.segments;

  const generated = segments.filter(function(seg) {
    return seg.status === "generated";
  });
  const totalDuration = generated.reduce(function(sum, seg) {
    return sum + (seg.duration || 0);
  }, 0);

  let html = '<div class="pl-toolbar">';
  html += '<div class="pl-chip pl-chip-accent"><span class="pl-chip-label">声线</span><span class="pl-chip-val">' + voice + "</span></div>";
  html += '<div class="pl-chip"><span class="pl-chip-label">语速</span><span class="pl-chip-val">' + speed.toFixed(1) + "x</span></div>";
  html += '<div class="pl-chip pl-chip-green"><span class="pl-chip-label">已生成</span><span class="pl-chip-val">' + generated.length + "/" + segments.length + "</span></div>";
  html += '<div class="pl-chip"><span class="pl-chip-label">总时长</span><span class="pl-chip-val">' + totalDuration.toFixed(1) + "s</span></div>";
  html += '<div class="pl-divider"></div>';
  html += '<span class="pl-seg-pill active" data-seg="-1" data-filter-seg="-1">全部</span>';
  for (let i = 0; i < segments.length; i++) {
    html += '<span class="pl-seg-pill" data-seg="' + i + '" data-filter-seg="' + i + '">段 ' + (i + 1) + "</span>";
  }
  html += "</div>";

  html += "<div class=\"pl-table\"><table><thead><tr>";
  html += '<th style="width:45%">文案</th>';
  html += '<th style="width:55%">音频</th>';
  html += "</tr></thead><tbody>";

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const seg = segments[segmentIndex];
    const script = scriptSegments[segmentIndex];
    const isGenerated = seg.status === "generated";
    const trClass = isGenerated ? "" : ' class="seg-pending"';

    html += '<tr data-seg="' + segmentIndex + '"' + trClass + ">";
    html += '<td class="col-text">' + escHtml(script.narration) + "</td>";
    html += '<td class="col-audio">';
    html += '<div class="audio-head">';

    if (isGenerated) {
      const audioPath = seg.file ? ("~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/" + seg.file) : null;
      if (audioPath) {
        html += '<button class="pl-play-btn" data-audio-path="' + escHtml(audioPath) + '" data-nf-action="play" data-nf-state="paused">&#9654;</button>';
      }
      html += '<span class="pl-tag-generated">已生成</span>';
      html += '<span class="audio-duration" data-nf-time="' + escHtml(String(seg.duration.toFixed(3))) + '">' + seg.duration.toFixed(1) + "s</span>";
    } else {
      html += '<span class="pl-tag-pending">待生成</span>';
    }

    html += "</div>";

    if (isGenerated && seg.sentences && seg.sentences.length > 0) {
      html += '<div class="sentence-list">';
      for (let sentenceIndex = 0; sentenceIndex < seg.sentences.length; sentenceIndex++) {
        const sentence = seg.sentences[sentenceIndex];
        const startFmt = fmtTime(sentence.start);
        const endFmt = fmtTime(sentence.end);
        const duration = (sentence.end - sentence.start).toFixed(1);

        html += '<div class="sentence-row">';
        html += '<span class="s-timecode" data-nf-time="' + escHtml(String(sentence.start.toFixed(3))) + '">' + startFmt + ' <span class="s-arrow">&rarr;</span> ' + endFmt + "</span>";
        html += '<span class="s-text">' + renderPipelineKaraokeSentence(sentence) + "</span>";
        html += '<span class="s-dur">' + duration + "s</span>";
        html += "</div>";
      }
      html += "</div>";
    }

    html += "</td></tr>";
  }

  html += "</tbody></table></div>";
  return html;
}

function fmtTime(sec) {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  const mm = (minutes < 10 ? "0" : "") + minutes;
  const whole = Math.floor(seconds);
  const frac = Math.round((seconds - whole) * 10);
  const ss = (whole < 10 ? "0" : "") + whole;
  return mm + ":" + ss + "." + frac;
}

function renderPipelineKaraokeSentence(sentence) {
  if (!sentence || !sentence.words || sentence.words.length === 0) {
    return escHtml((sentence && sentence.text) || "");
  }

  let html = "";
  for (let i = 0; i < sentence.words.length; i++) {
    const word = sentence.words[i] || {};
    const charText = word.char == null ? "" : String(word.char);
    if (!charText) {
      continue;
    }
    html += '<span class="karaoke-char unspoken" data-start="' + escHtml(String(word.start == null ? 0 : word.start)) + '" data-end="' + escHtml(String(word.end == null ? 0 : word.end)) + '">' + escHtml(charText) + "</span>";
  }

  return html || escHtml(sentence.text || "");
}
