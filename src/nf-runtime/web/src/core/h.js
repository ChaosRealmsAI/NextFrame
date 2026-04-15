function appendChildNode(parent, child) {
  if (Array.isArray(child)) {
    child.forEach((item) => appendChildNode(parent, item));
    return;
  }
  if (child == null || child === false) return;
  if (typeof child === 'string' || typeof child === 'number') {
    parent.append(String(child));
    return;
  }
  parent.appendChild(child);
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value);
    }
  });
  children.forEach((child) => appendChildNode(el, child));
  return el;
}

window.h = h;
