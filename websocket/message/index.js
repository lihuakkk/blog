/* eslint-disable comma-dangle */
/*
case:
1、掉线（offline）期间，不考虑同一个浏览器新窗口登录问题，
再次上线（online），
判断登录token，可用就重新连接
2、同一个浏览器打开新的窗口，旧的退出登录。
会收到一个kick out的消息， 触发onerror或者onclose
不需要重新连接
3、不同浏览器打开新的窗口，触发onclose或者onerror 旧的退出登录
此时登录token应该不可用，不用重新连接
4、没有打开新窗口，收到 onerror 或者 onclose ，
1秒内，没有收到kick out的消息，则关掉连接，新建一个连接
5、连接内，10秒内没有收到心跳消息, 加快心跳，如果还没有响应，则进行重连

所有的重连都要先判断是否处于登录态
token，可用状态，关闭原连接进行重连

增加ws检测：如果需要重连就重连，不需要就执行关闭操作。
ps: 被踢出之后，只能重新扫码登录才能连接，不然再也不会重连了


流程

初始化session
  连接ws
    连接服务器
    登录服务器
  更新session ws信息
  添加网络监听

关闭session
 关闭ws
 移除网络监听

重连ws

*/

import PubSub from 'pubsub-js';
import {
  isRequestTypeInRules,
  isResponseTypeInRules,
  wrapMessage2Request,
  wrapMessage2Response,
} from './pn2RequestPatch';
import {
  connectWebsocket,
  parseData,
  isWebsocketConnect,
  closeWebsocket,
  abortWebsocket,
  formatWebsocketCloseCode,
} from '@/websocket/websocket';
import { deadlinePromise, promisePendingLock } from './utils';

/*
设计思路：
引入会话（session）概念，表示当前浏览器窗口下用户与远程消息服务器的连接。
一个完整的会话包括: websocket实例、连接状态、消息统计，重试相关，最近一次连接时间，最近一次消息发送时间等信息
对外只暴露session相关的方法，通过session提供的方法来维护websocket连接。

流程：

1、新建一个会话（session）
2、连接并登录消息服务器
3、发送心跳到服务器，开始心跳检测

心跳逻辑：
每10秒发送一个心跳，如果十秒内没有收到服务器的回应，加快心跳为3秒发送一个，下一个十秒还没有收到任何响应，执行重连逻辑

重连逻辑：
没有被被踢出并且token可用，执行重连（流程第二步开始）
三次之后还没有连上，显示消息服务器断开连接提示

网络监听：
断网：显示消息服务器断开连接提示
恢复连接：执行重连逻辑

*/

// 一些常量
const WS_CLOSE_FOR_ERROR = 4002; //
const WS_CLOSE_FOR_SESSION_CLOSE = 4003; // 主动关闭连接
const HEARTBEAT_INTERVAL_NORMAL = 10 * 1000;
const HEARTBEAT_INTERVAL_SPEEDUP = 3 * 1000;
const MESSAGE_TIMEOUT = 15 * 1000;

let session;

function generateSessionInfo(options) {
  const basic = {
    ws: null,
    wsAddress: null,
    wsStatus: 'disconnect', // pn2连接状态，connecting | connect | disconnect
    retries: 3,
    retryCount: 0, // 当前重试次数
    isKickout: false, // 是否被踢掉
    lastMessageTimestamp: 0, // 最近一次收到消息时间
    lastConnectTimestamp: 0, // 最近一次连接时间
    online: true, // 网络情况
    statistics: {
      retryCounts: 0, // 一共重连的次数
      loseConnectTimes: 0, // 丢失连接的次数
      receiveCounts: 0, // 发送消息总数
      sendCounts: 0, // 接收消息总数
    },
  };
  return Object.assign(basic, options)
}

function newSession(options) {
  session = generateSessionInfo(options);
  return session;
}

function updateSession(data) {
  if (session) {
    Object.assign(session, data);
    store.commit('setPn2Status', session.wsStatus);
  }
}

function sessionLog(str) {
  console.log(`IM session log -----> ${str} --- ${new Date()}`);
}

function closeMessageSession() {
  // clear token
  closeWS({
    code: WS_CLOSE_FOR_SESSION_CLOSE,
    reason: '关闭消息会话'
  }).then(() => {
    session = null;
  })
  removeNetworkEventListener();
}

function initMessageSession(wsAddress) {
  newSession({
    wsAddress,
  });
  return connectWS(wsAddress)
    .then(ws => {
      setSessionWS(ws);
      addNetworkListener();
    })
    .catch(error => {
      updateSession({
        wsStatus: 'disconnect',
      });
      console.log('connect message server error', error);
    });
}

// 强行重置ws连接，如果需要执行重连
// 丢包也适用
const resetSessionWSConnect = promisePendingLock(_resetSessionWSConnect);
function _resetSessionWSConnect() {
  if (!session) {
    sessionLog('reconnect failed session is reset')
    return Promise.resolve();
  }

  if (!session.online) {
    sessionLog('reconnect failed network offline')
    return Promise.resolve();
  }

  if (session.isKickout) {
    sessionLog('reconnect failed session kickout')
    return Promise.resolve();
  }

  return checkLocalTokenValid().then(isLogin => {
    if (isLogin) {
      reconnectWS();
    } else {
      sessionLog('check local token failed');
      router.push({ name: 'login' });
    }
  });
}

function initWS(ws) {
  ws.binaryType = 'arraybuffer';
  ws.onmessage = onmessage;
  ws.onclose = onclose;
  ws.onerror = onerror;
  startHeartbeat(HEARTBEAT_INTERVAL_NORMAL);
  return ws;

  function onmessage(evt) {
    const evtData = parseData(evt.data);

    if (!evtData || !evtData.data) {
      return;
    }
    updateSession({
      lastMessageTimestamp: Date.now(),
    });
    handleMessage(evtData);
  }

  function onclose(evt) {
    sessionLog(
      `onclose , ${
        evt.reason ? ' reason ' + evt.reason : '' + ' ' + formatWebsocketCloseCode(evt.code)
      }`
    );
    if (evt.code !== WS_CLOSE_FOR_SESSION_CLOSE) {
      setTimeout(() => resetSessionWSConnect(), 1 * 1000);
    }
  }

  // edge 浏览器 kickoff 消息会在 onerror之后发生
  function onerror(evt) {
    sessionLog(`onerror, readyState, evt, ${session.ws.readyState}, ${JSON.stringify(evt)}`);
    closeWS({
      code: WS_CLOSE_FOR_ERROR,
      reason: 'onerror 触发'
    }).then(() => {
      sessionLog('onerror, connect error close ws');
    });
  }
}

function setSessionWS(ws) {
  const timeStampNow = Date.now();
  const { lastMessageTimestamp } = session.lastMessageTimestamp;
  updateSession({
    ws,
    wsStatus: 'connect',
    lastConnectTimestamp: timeStampNow,
    lastMessageTimestamp: timeStampNow,
  });
  // 连接中断期间 漏收的消息
  if (lastMessageTimestamp) {
    PubSub.publish('RECONNECT', { start_uts, end_uts }});
  }
  initWS(ws);
}

// 连接消息服务器 = 连接 + 登录
function connectWS(wsAddress) {
  updateSession({
    wsStatus: 'connecting',
  });
  return connectWebsocket(wsAddress).then(ws => {
    return loginWS(ws).then(() => ws);
  });
}

function loginWS(ws) {
  const loginPromise = new Promise((resolve, reject) => {
    sessionLog('before login');
    ws.onerror = function(evt) {
      reject(evt);
    };
    ws.onclose = function(evt) {
      reject(evt);
    };
    ws.onmessage = function(evt) {
      const evtData = parseData(evt.data) || {};
      const { operation, data } = evtData;
      if (operation === 'login response') {
        if (data.error_code === 0) {
          sessionLog('login success');
          resolve(data);
        } else {
          sessionLog(`login error ${JSON.stringify(data)}`);
          reject(data);
        }
      }
    };
    ws.send(getLoginStr());
  });

  return Promise.race([loginPromise, deadlinePromise(MESSAGE_TIMEOUT)]);
}

function getLoginStr() {
  const loginInfo = {
    operation: 'login',
    data: {
      // ...
    },
  };
  return JSON.stringify(loginInfo);
}

function handleMessage(evtData) {
  if (isResponseTypeInRules(evtData.operation)) {
    PubSub.publish(PN2_WS_TYPE.MESSAGE, evtData);
    wrapMessage2Response(evtData);
  }
}

function sendMessage(message) {
  try {
    session.ws.send(JSON.stringify(message));
  } catch (e) {
    if (isRequestTypeInRules(message.operation)) {
      throw new Error('');
    }
  }

  if (isRequestTypeInRules(message.operation)) {
    return wrapMessage2Request(message);
  }
}

let heartbeatTimeoutId;
function startHeartbeat(interval) {
  stopHeartbeat(); // 移除上次的heartbeatTimeoutId，保证只有一个定时器在运行
  heartbeatMessage();
  heartbeatTimeoutId = setTimeout(() => {
    const now = Date.now();
    if (now - session.lastMessageTimestamp > 2 * HEARTBEAT_INTERVAL_NORMAL) {
      return resetSessionWSConnect();
    }
    if (now - session.lastMessageTimestamp > HEARTBEAT_INTERVAL_NORMAL) {
      return speedupHeartbeat();
    }
    startHeartbeat(interval);
  }, interval);
}

function speedupHeartbeat() {
  startHeartbeat(HEARTBEAT_INTERVAL_SPEEDUP);
}

function stopHeartbeat() {
  heartbeatTimeoutId && clearTimeout(heartbeatTimeoutId);
}

function heartbeatMessage() {
  const msg = {
    // 心跳格式
  };
  sendMessage(msg);
}

// 重连 = 关闭上一个ws + 新建一个ws
function reconnectWS() {
  const { ws, wsAddress, wsStatus } = session;
  ws && abortWS(ws);
  if (session.retryCount < session.retries) {
    updateSession({
      retryCount: session.retryCount + 1,
    });
    connectWS(wsAddress)
      .then(ws => {
        setSessionWS(ws);
        updateSession({
          retryCount: 0,
        });
      })
      .catch(e => {
        sessionLog('connect ws error', e);
        resetSessionWSConnect();
      });
  } else {
    updateSession({
      wsStatus: 'disconnect',
      retryCount: 0,
    });
  }
}

// ws关闭后续要将心跳
function closeWS(options) {
  return closeWebsocket(session.ws, options).then(() => {
    stopHeartbeat();
  });
}

function abortWS(ws) {
  abortWebsocket(ws)
}

function addNetworkListener() {
  removeNetworkEventListener();
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
}

function removeNetworkEventListener() {
  window.removeEventListener('online', online);
  window.removeEventListener('offline', offline);
}

function online() {
  updateSession({
    online: true,
  });
  if (!isWebsocketConnect(session.ws)) {
    resetSessionWSConnect();
  }
}

function offline() {
  sessionLog('network offline')
  updateSession({
    online: false,
    wsStatus: 'disconnect'
  });
}

// 获取时间，后期使用服务器时间修正本地时间
function getFixedTimestamp() {
  const now = Date.now();
  return now;
}

export {
  initMessageSession,
  closeMessageSession,
  resetSessionWSConnect,
  sendMessage,
}
