import { CLIP_LABEL_ORDER, getClipLabelColor, normalizeClipLabel } from "../../clip-labels.js";

export function createInspectorSection(title, subtitle) {
  const section = document.createElement("section");
  section.className = "inspector-section";

  const header = document.createElement("div");
  header.className = "inspector-section-header";

  const heading = document.createElement("strong");
  heading.textContent = title;
  header.appendChild(heading);

  if (subtitle) {
    const hint = document.createElement("span");
    hint.textContent = subtitle;
    header.appendChild(hint);
  }

  const body = document.createElement("div");
  body.className = "inspector-section-body";

  section.append(header, body);
  return { section, body };
}

export function createReadonlyRow(label, value) {
  const row = document.createElement("div");
  row.className = "inspector-static-row";

  const title = document.createElement("span");
  title.className = "inspector-static-label";
  title.textContent = label;

  const content = document.createElement("span");
  content.className = "inspector-static-value";
  content.textContent = value;

  row.append(title, content);
  return row;
}

export function createClipOrganizeSection({
  clip,
  onLabelChange,
  onNoteChange,
} = {}) {
  const organize = createInspectorSection("Organize", "Labels and notes");
  const selectedLabel = normalizeClipLabel(clip?.label);

  const labelField = document.createElement("div");
  labelField.className = "inspector-field";

  const labelCopy = document.createElement("div");
  labelCopy.className = "inspector-field-copy";

  const labelTitle = document.createElement("span");
  labelTitle.className = "inspector-field-label";
  labelTitle.textContent = "Label";
  labelCopy.appendChild(labelTitle);

  const picker = document.createElement("div");
  picker.className = "color-label-picker";
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "Clip label");

  const options = [
    { value: "", text: "None" },
    ...CLIP_LABEL_ORDER.map((label) => ({
      value: label,
      text: label[0].toUpperCase() + label.slice(1),
    })),
  ];

  options.forEach(({ value, text }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-label-button";
    button.dataset.colorLabel = value || "none";
    button.textContent = text;
    button.setAttribute("aria-pressed", String(selectedLabel === value));
    button.classList.toggle("is-active", selectedLabel === value);

    const color = getClipLabelColor(value);
    if (color) {
      button.style.setProperty("--color-label-swatch", color);
    }

    if (typeof onLabelChange === "function") {
      button.addEventListener("click", () => {
        onLabelChange(value);
      });
    }

    picker.appendChild(button);
  });

  labelField.append(labelCopy, picker);

  const noteField = document.createElement("label");
  noteField.className = "inspector-field";

  const noteCopy = document.createElement("div");
  noteCopy.className = "inspector-field-copy";

  const noteTitle = document.createElement("span");
  noteTitle.className = "inspector-field-label";
  noteTitle.textContent = "Note";
  noteCopy.appendChild(noteTitle);

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.name = "note";
  noteInput.className = "inspector-input";
  noteInput.value = typeof clip?.note === "string" ? clip.note : "";

  if (typeof onNoteChange === "function") {
    noteInput.addEventListener("change", (event) => {
      onNoteChange(event.target.value);
    });
  }

  noteField.append(noteCopy, noteInput);
  organize.body.append(labelField, noteField);
  return organize;
}
