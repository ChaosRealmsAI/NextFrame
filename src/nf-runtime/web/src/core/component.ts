class Component {
  children: any;
  el: any;
  props: any;
  state: any;
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.el = null;
    this.children = [];
  }

  render() {
    return document.createElement('div');
  }

  mount(container: any) {
    this.el = this.render();
    container.appendChild(this.el);
    this.didMount();
  }

  update(newProps: any) {
    this.props = Object.assign({}, this.props, newProps);
    const parent = this.el && this.el.parentNode;
    if (!parent) return;
    this.destroyChildren();
    const newEl = this.render();
    parent.replaceChild(newEl, this.el);
    this.el = newEl;
  }

  setState(partial: any) {
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
    this.children.forEach((child: any) => child.destroy());
    this.children = [];
  }
}

window.Component = Component;
