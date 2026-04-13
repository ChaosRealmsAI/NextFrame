/* === pipeline/editor-sidebar.js === */
function populateEditorClipSidebar() {
  const list = document.getElementById("editor-clip-list");
  const count = document.getElementById("editor-clip-count");
  if (!list) {
    return;
  }
  if (!pipelineData || !pipelineData.script || !pipelineData.script.segments || pipelineData.script.segments.length === 0) {
    if (currentProject && currentEpisode) {
      bridgeCall("fs.read", { path: "~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/pipeline.json" }, 3000).then(function(result) {
        try {
          pipelineData = JSON.parse(result.contents);
          renderEditorClips();
        } catch (_error) {}
      }).catch(function() {});
    }
    list.innerHTML = '<div style="padding:20px;color:rgba(228,228,232,0.25);font-size:12px;text-align:center">暂无片段</div>';
    if (count) {
      count.textContent = "0";
    }
    return;
  }
  renderEditorClips();
}

function renderEditorClips() {
  const list = document.getElementById("editor-clip-list");
  const countEl = document.getElementById("editor-clip-count");
  if (!list || !pipelineData) {
    return;
  }
  const segments = pipelineData.script.segments || [];
  const audioSegments = (pipelineData.audio || {}).segments || [];
  if (countEl) {
    countEl.textContent = segments.length + " 个片段";
  }
  const html = segments.map(function(seg, index) {
    const audio = audioSegments.find(function(entry) {
      return entry.segment === seg.segment;
    });
    const duration = audio && audio.duration ? audio.duration + "s" : "—";
    const role = seg.role ? seg.role + " — " : "";
    return '<div class="editor-clip-item' + (index === 0 ? " active" : "") + '" onclick="selectEditorClip(this)">' +
      '<div class="editor-clip-name">' + escHtml(role + (seg.narration || "").substring(0, 12)) + "</div>" +
      '<div class="editor-clip-meta">段 ' + (seg.segment || index + 1) + " · " + duration + "</div>" +
    "</div>";
  }).join("");
  list.innerHTML = html;
}

function selectEditorClip(el) {
  document.querySelectorAll(".editor-clip-item").forEach(function(item) {
    item.classList.remove("active");
  });
  el.classList.add("active");
}
