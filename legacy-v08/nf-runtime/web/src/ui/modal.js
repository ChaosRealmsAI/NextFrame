"use strict";
class Modal extends Component {
    isOpen() {
        return !!this.props.open;
    }
    overlayClassName() {
        return 'modal-overlay';
    }
    panelClassName() {
        return 'modal-panel';
    }
    renderBody() {
        return document.createElement('div');
    }
    renderPanel() {
        return h('div', {
            id: this.props.panelId,
            class: this.panelClassName() + (this.isOpen() ? ' open' : ''),
            'data-nf-action': this.props.panelAction || '',
            style: this.props.panelStyle || {},
        }, this.renderBody());
    }
    render() {
        return h('div', { class: 'nf-modal-shell' }, h('div', {
            id: this.props.overlayId,
            class: this.overlayClassName() + (this.isOpen() ? ' open' : ''),
            'data-nf-action': this.props.overlayAction || '',
            onclick: this.props.onOverlayClick || null,
        }), this.renderPanel());
    }
}
window.Modal = Modal;
