class Component {
  children: Component[];
  el: HTMLElement | null;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  constructor(props: Record<string, unknown> = {}) {
    this.props = props;
    this.state = {};
    this.el = null;
    this.children = [];
  }

  render(): HTMLElement | string {
    return document.createElement('div');
  }

  mount(container: HTMLElement) {
    this.el = this.render() as HTMLElement;
    container.appendChild(this.el);
    this.didMount();
  }

  update(newProps: Record<string, unknown>) {
    this.props = Object.assign({}, this.props, newProps);
    const parent = this.el && this.el.parentNode;
    if (!parent) return;
    this.destroyChildren();
    const newEl = this.render() as HTMLElement;
    parent.replaceChild(newEl, this.el!);
    this.el = newEl;
  }

  setState(partial: Record<string, unknown>) {
    Object.assign(this.state, partial);
    this.update(this.props);
  }

  destroy() {
    this.destroyChildren();
    if (this.el) this.el.remove();
    this.willUnmount();
  }

  didMount() {}

  willUnmount() {}

  destroyChildren() {
    this.children.forEach((child) => child.destroy());
    this.children = [];
  }
}

window.Component = Component;
