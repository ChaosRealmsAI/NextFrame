use tokio::sync::oneshot;

use crate::ipc_server::{IpcRequest, IpcResponse};

#[derive(Debug)]
pub enum UserEvent {
    OpenWindow {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    CloseWindow {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    StateQuery {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    ClickSim {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    Screenshot {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    Quit {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
}
