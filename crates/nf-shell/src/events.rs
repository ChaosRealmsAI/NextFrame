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
    DevtoolsQuery {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
    IpcFromJs {
        window_id: String,
        body: String,
    },
    Quit {
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    },
}
