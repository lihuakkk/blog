import { deadlinePromise, noop } from '@/utils';

const CONNECTING = WebSocket.CONNECTING;
const OPEN = WebSocket.OPEN;
const CLOSING = WebSocket.CLOSING;
const CLOSED = WebSocket.CLOSED;

export function connectWebsocket(address, { TIMEOUT = 15 * 1000 } = {}) {
  const connectPromise = new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(address);
      ws.onopen = () => {
        resolve(ws);
      };
      ws.onerror = error => {
        reject(error);
      };
    } catch (e) {
      console.log('connect Websocket error', e);
      reject(error);
    }
  });
  return Promise.race([connectPromise, deadlinePromise(TIMEOUT)]);
}

export function closeWebsocket(ws, options = {}) {
  if (!ws || ws.readyState === CLOSED) {
    return Promise.resolve();
  }
  if (!ws.closePromise) {
    ws.closePromise = new Promise((resolve, reject) => {
      const _close = ws.onclose || noop;
      ws.onclose = evt => {
        _close(evt);
        resolve();
      };
      ws.close(options.code, options.reason);
    });
  }
  return ws.closePromise;
}

export function abortWebsocket(ws) {
  resetWebsocket(ws);
  ws.close();
}

export function isWebsocketConnect(ws = {}) {
  const readyState = ws.readyState;
  return readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN;
}

export function formatWebsocketCloseCode(code = 0) {
  let str = `${code} --> `;
  const ref = 'MDN参考：https://developer.mozilla.org/zh-CN/docs/Web/API/CloseEvent';
  switch (code) {
    case 1000:
      str += 'CLOSE_NORMAL --> 正常关闭';
      break;
    case 1001:
      str += 'CLOSE_GOING_AWAY --> 终端离开';
      break;
    case 1002:
      str += 'CLOSE_PROTOCOL_ERROR --> 由于协议错误而中断连接';
      break;
    case 1003:
      str +=
        'CLOSE_UNSUPPORTED --> 由于接收到不允许的数据类型而断开连接 (如仅接收文本数据的终端接收到了二进制数据).';
      break;
    case 1005:
      str += 'CLOSE_NO_STATUS --> 表示没有收到预期的状态码';
      break;
    case 1006:
      str += 'CLOSE_ABNORMAL --> 用于期望收到状态码时连接非正常关闭 (也就是说, 没有发送关闭帧)';
      break;
    case 1007:
      str +=
        'Unsupported Data --> 由于收到不符合约定的数据而断开连接. 这是一个通用状态码, 用于不适合使用 1003 和 1009 状态码的场景';
      break;
    case 1009:
      str += 'CLOSE_TOO_LARGE --> 由于收到过大的数据帧而断开连接';
      break;
    case 1010:
      str += 'Missing Extension --> 客户端期望服务器商定一个或多个拓展, 但服务器没有处理, 因此客户端断开连接';
      break;
    case 1011:
      str += 'Internal Error --> 客户端由于遇到没有预料的情况阻止其完成请求, 因此服务端断开连接';
      break;
    case 1012:
      str += 'Service Restart --> 服务器由于重启而断开连接';
      break;
    case 1013:
      str += 'Try Again Later --> 服务器由于临时原因断开连接, 如服务器过载因此断开一部分客户端连接';
      break;
    case 1015:
      str += 'TLS Handshake -->  表示连接由于无法完成 TLS 握手而关闭 (例如无法验证服务器证书)';
      break;
  }
  // switch code
  return str + ' --> ' + ref;
}

function resetWebsocket(ws) {
  ws.onclose = noop;
  ws.onerror = noop;
  ws.onmessage = noop;
  ws.onopen = noop;
}

let decoder;
if (window.TextDecoder) {
  decoder = new window.TextDecoder('utf-8');
}

// 参考 https://github.com/inexorabletash/text-encoding
function Uint8ArrayToString(uint8Array) {
  return uint8Array.reduce((string, uniode) => string + String.fromCharCode(uniode), '');
}

function ab2str(buf) {
  let result;
  try {
    const uint8Array = new Uint8Array(buf);
    result = decoder ? decoder.decode(uint8Array) : Uint8ArrayToString(uint8Array);
  } catch (e) {
    console.log('parse arraybuff error', e, buf);
  }
  return result;
}

function parseArrayBuff(arraybuff) {
  const string = ab2str(arraybuff);
  return parseString(string);
}

function parseString(string) {
  let result;
  try {
    result = JSON.parse(string);
  } catch (e) {
    console.log('parse string error', e, string);
  }
  return result;
}

function isArrayBuff(data) {
  return Object.prototype.toString.call(data) === '[object ArrayBuffer]';
}

// 解析json arraybuff 其他的原样返回
export function parseData(data) {
  return typeof data === 'string'
    ? parseString(data)
    : typeof data === 'object' && isArrayBuff(data)
    ? parseArrayBuff(data)
    : data;
}
