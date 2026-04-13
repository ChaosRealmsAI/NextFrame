/* === pipeline/script-stage.js === */
function renderPipelineScript(data) {
  const script = data && data.script;
  if (!script || !script.segments || script.segments.length === 0) {
    return '<div class="pipeline-empty" style="padding:40px;text-align:center;color:rgba(228,228,232,0.5);font-size:13px;">No script data</div>';
  }

  const principles = script.principles || {};
  const segments = script.segments;
  let html = "";

  html += '<div class="pl-toolbar" style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-wrap:wrap;gap:20px;align-items:center;">';
  const pKeys = Object.keys(principles);
  for (let p = 0; p < pKeys.length; p++) {
    const key = pKeys[p];
    html += '<div class="pl-chip" style="display:flex;align-items:center;gap:6px;">';
    html += '<span class="pl-chip-label" style="font-size:11px;color:rgba(228,228,232,0.5);">' + escHtml(key) + '</span>';
    html += '<span class="pl-chip-val" style="font-size:12px;color:rgba(228,228,232,0.5);font-weight:500;">' + escHtml(principles[key]) + "</span>";
    html += "</div>";
  }
  html += "</div>";

  html += '<div class="pl-divider" style="height:0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>';

  html += '<div class="pl-toolbar" style="padding:8px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;align-items:center;">';
  html += '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-right:8px;">Segments</span>';
  html += '<span class="pl-seg-pill" data-seg="-1" data-filter-seg="-1" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid rgba(124,106,239,0.2);background:rgba(124,106,239,0.15);color:#7c6aef;cursor:pointer;">All</span>';
  for (let s = 0; s < segments.length; s++) {
    html += '<span class="pl-seg-pill" data-seg="' + s + '" data-filter-seg="' + s + '" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid transparent;background:transparent;color:rgba(228,228,232,0.5);cursor:pointer;">' + escHtml(String(segments[s].segment)) + "</span>";
  }
  html += "</div>";

  html += '<div class="pl-table" style="width:100%;overflow-y:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += "<thead><tr>";
  html += '<th style="width:55%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Narration</th>';
  html += '<th style="width:45%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Details</th>';
  html += "</tr></thead>";
  html += "<tbody>";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    html += '<tr data-seg="' + i + '">';
    html += '<td style="font-family:Georgia,\'Times New Roman\',serif;font-size:17px;line-height:1.9;color:#e4e4e8;width:55%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';
    html += escHtml(seg.narration || "");
    html += "</td>";

    html += '<td style="background:#111114;width:45%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';

    if (seg.visual) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Visual</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.visual) + "</div>";
      html += "</div>";
    }

    if (seg.role) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Intent</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.role) + "</div>";
      html += "</div>";
    }

    if (seg.logic) {
      html += '<div class="pl-meta-item" style="margin-bottom:0;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Logic</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;font-style:italic;">' + escHtml(seg.logic) + "</div>";
      html += "</div>";
    }

    html += "</td>";
    html += "</tr>";
  }

  html += "</tbody></table></div>";
  return html;
}

function plFilterSeg(idx) {
  const pills = document.querySelectorAll(".pl-seg-pill");
  for (let i = 0; i < pills.length; i++) {
    const isActive = (idx === -1) ? (i === 0) : (parseInt(pills[i].getAttribute("data-seg"), 10) === idx);
    if (isActive) {
      pills[i].style.background = "rgba(124,106,239,0.15)";
      pills[i].style.color = "#7c6aef";
      pills[i].style.borderColor = "rgba(124,106,239,0.2)";
    } else {
      pills[i].style.background = "transparent";
      pills[i].style.color = "rgba(228,228,232,0.5)";
      pills[i].style.borderColor = "transparent";
    }
  }

  const rows = document.querySelectorAll(".pl-table tbody tr[data-seg]");
  for (let r = 0; r < rows.length; r++) {
    rows[r].style.display = (idx === -1 || parseInt(rows[r].getAttribute("data-seg"), 10) === idx) ? "" : "none";
  }
}
