/* === pipeline/atoms-stage.js === */
function renderPipelineAtoms(data) {
  const atoms = data.atoms || [];
  const counts = { all: atoms.length, component: 0, video: 0, image: 0 };
  atoms.forEach(function(atom) {
    if (counts[atom.type] !== undefined) {
      counts[atom.type] += 1;
    }
  });

  const typeLabels = { component: "组件", video: "视频", image: "图片" };
  let html = '<div class="pl-toolbar pl-toolbar-stats">';
  html += '<div class="pl-chip"><span class="pl-chip-label">总计</span><span class="pl-chip-val">' + counts.all + " 个原子</span></div>";
  html += '<div class="pl-chip"><span class="pl-chip-label">组件</span><span class="pl-chip-val">' + counts.component + "</span></div>";
  html += '<div class="pl-chip"><span class="pl-chip-label">视频</span><span class="pl-chip-val">' + counts.video + "</span></div>";
  html += '<div class="pl-chip"><span class="pl-chip-label">图片</span><span class="pl-chip-val">' + counts.image + "</span></div>";
  html += "</div>";

  html += '<div class="pl-toolbar">';
  html += '<span class="pl-seg-pill active" data-filter-type="all">全部 ' + counts.all + "</span>";
  html += '<span class="pl-seg-pill" data-filter-type="component">' + typeLabels.component + " " + counts.component + "</span>";
  html += '<span class="pl-seg-pill" data-filter-type="video">' + typeLabels.video + " " + counts.video + "</span>";
  html += '<span class="pl-seg-pill" data-filter-type="image">' + typeLabels.image + " " + counts.image + "</span>";
  html += "</div>";

  html += '<div class="pl-atoms-grid">';
  atoms.forEach(function(atom) {
    const typeClass = atom.type;
    const typeLabel = typeLabels[atom.type] || atom.type;
    let desc = "";

    if (atom.type === "component") {
      desc = "scene &middot; " + escHtml(atom.scene || atom.name) + ".js";
    } else if (atom.type === "video") {
      const videoParts = [];
      if (atom.duration != null) {
        videoParts.push(atom.duration + "s");
      }
      if (atom.dimensions) {
        videoParts.push(atom.dimensions);
      }
      desc = videoParts.join(" &middot; ");
    } else if (atom.type === "image") {
      const imageParts = [];
      if (atom.dimensions) {
        imageParts.push(atom.dimensions);
      }
      if (atom.size) {
        imageParts.push(atom.size);
      }
      desc = imageParts.join(" &middot; ");
    }

    html += '<div class="pl-atom-card" data-type="' + escHtml(atom.type) + '">';
    html += '<div class="pl-atom-preview">';
    if (atom.type === "component") {
      html += "<span>" + escHtml(atom.scene || atom.name) + "</span>";
    } else {
      html += "<span>" + escHtml(atom.file || atom.name) + "</span>";
    }
    html += "</div>";

    html += '<div class="pl-atom-info">';
    html += '<div class="pl-atom-name">';
    html += "<span>" + escHtml(atom.name) + "</span>";
    html += '<span class="pl-atom-type-tag ' + typeClass + '">' + escHtml(typeLabel) + "</span>";
    if (atom.segment != null) {
      html += '<span class="pl-atom-seg">段 ' + escHtml(String(atom.segment)) + "</span>";
    }
    html += "</div>";

    if (desc) {
      html += '<div class="pl-atom-desc">' + desc + "</div>";
    }

    if (atom.file && (atom.type === "video" || atom.type === "image")) {
      html += '<div class="pl-atom-path">' + escHtml(atom.file) + "</div>";
    }

    html += "</div>";
    html += "</div>";
  });
  html += "</div>";

  return html;
}
