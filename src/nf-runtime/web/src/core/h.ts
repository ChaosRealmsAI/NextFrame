function appendChildNode(parent: HTMLElement, child: string | number | boolean | Node | null | undefined | unknown[]) {
  if (Array.isArray(child)) {
    child.forEach((item) => appendChildNode(parent, item as string | number | boolean | Node | null | undefined | unknown[]));
    return;
  }
  if (child == null || child === false) return;
  if (typeof child === 'string' || typeof child === 'number') {
    parent.append(String(child));
    return;
  }
  parent.appendChild(child as Node);
}

function h(tag: string, attrs: Record<string, unknown> | null = {}, ...children: (string | Node | null | undefined)[]) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = value as string;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value as string);
    }
  });
  children.forEach((child) => appendChildNode(el, child));
  return el;
}

window.h = h;
