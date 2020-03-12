/*
该部分是对使用websocket进行的一些请求操作的一些补充：
1、增加Promise回调
2、增加超时处理
3、增加重试机制


作用：
提高请求响应准确性
请求和处理的代码在同一个文件增强可读性
以后这些操作以后使用http请求的时候代码无需太多改动

概念: 请求池， 请求配置
对应： requestPool， config， message
requestPool = [config]
config = {
  message,
  ...
}

错误类型：
TIMEOUT // 超时
DISCONNECT // 断开连接
*/
import PubSub from 'pubsub-js';

const rules = [
  {
    requestType: 'request_offline_message',
    responseType: 'request_history_message_response',
    requestIdKey: 'request_id' // 'request_id
  }
];
const POLLING_INTERVAL = 1 * 1000;
const requestPool = [];
const defaultConfig = {
  retry: 0,
  retryCount: 0,
  timeout: 15 * 1000
};

function isRequestTypeInRules(requestType) {
  return !!rules.find(rule => rule.requestType === requestType);
}

function isResponseTypeInRules(responseType) {
  return !!rules.find(rule => rule.responseType === responseType);
}

function getSubId(requestId) {
  return 'PN2_RESPONSE_' + requestId;
}

function getTimeoutSubId(requestId) {
  return 'PN2_RESPONSE_TIMEOUT_' + requestId;
}

let pollingTimeoutId;
function pollingRequestPool() {
  pollingTimeoutId && clearTimeout(pollingTimeoutId);
  if (requestPool.length === 0) return;

  const now = Date.now();
  const fakerequestPool = requestPool.concat();
  fakerequestPool.forEach((config) => {
    const { timeout, lastTimeStamp, retryCount, retry, requestId } = config;
    if (now - lastTimeStamp > timeout) {
      if (retryCount < retry) {
        resendMessage(config);
      } else {
        PubSub.publish(getTimeoutSubId(requestId), config);
        removeRequestFromPool(requestId);
      }
    }
  });

  pollingTimeoutId = setTimeout(pollingRequestPool, POLLING_INTERVAL);
}

function findConfigIndex(requestId) {
  return requestPool.findIndex(config => config.requestId === requestId);
}

function getRequestType(message) {
  return message.operation;
}

function getReponseType(responseMessage) {
  return responseMessage.operation;
}

function getRequestId(message) {
  const requestType = getRequestType(message);
  const rule = rules.find(ruleItem => ruleItem.requestType === requestType)
  return message.data[rule.requestIdKey]; // request_id
}

function getResponseId(responseMessage) {
  const responseType = getReponseType(responseMessage);
  const rule = rules.find(ruleItem => ruleItem.responseType === responseType)
  return responseMessage.data[rule.requestIdKey]; // request_id
}

function updateRequestPool(config) {
  const configIndex = findConfigIndex(config.requestId);
  if (configIndex === -1) {
    requestPool.push(config);
  } else {
    const retryCount = config.retryCount++;
    const newConfig = Object.assign({}, config, {
      retryCount,
      lastTimeStamp: Date.now()
    })
    requestPool.splice(configIndex, 1 , newConfig)
  }
  pollingRequestPool();
}

function getRequestConfig(message, customConfig = {}) {
  const requestId = getRequestId(message);
  const configIndex = findConfigIndex(requestId);
  if (configIndex !== -1) {
    return requestPool[configIndex];
  }

  let subToken;
  let subTimeoutToken;
  const requestType = getRequestType(message);
  const promise = new Promise((resolve, reject) => {
    subToken = PubSub.subscribeOnce(getSubId(requestId), (topic, responseMessage) => {
      PubSub.unsubscribe(subTimeoutToken);
      resolve(responseMessage);
    });

    subTimeoutToken = PubSub.subscribeOnce(getTimeoutSubId(requestId), (topic, config) => {
      console.log('messagePatch ---> timeout config', config);
      PubSub.unsubscribe(subToken);
      reject({ Error: 'TIMEOUT' });
    });
  });
  return {
    message,
    requestId,
    requestType,
    lastTimeStamp: Date.now(),
    promise,
    subToken,
    subTimeoutToken,
    ...customConfig,
    ...defaultConfig
  };
}

function removeRequestFromPool(requestId) {
  const configIndex = findConfigIndex(requestId);
  if (configIndex === -1) {
    return;
  }
  const config = requestPool[configIndex];
  PubSub.unsubscribe(config.subToken);
  PubSub.unsubscribe(config.subTimeoutToken);
  requestPool.splice(configIndex, 1);
}

function wrapMessage2Request(request, customConfig = {}) {
  const config = getRequestConfig(request, customConfig);
  updateRequestPool(config);
  return config.promise;
}

function resendMessage(config) {
  console.log('messagePatch ---> resendMessage config', config);
  PubSub.publish(PN2_WS_TYPE.REQUEST_RETRY, config.message);
}

function wrapMessage2Response(response) {
  const responseId = getResponseId(response);
  PubSub.publish(getSubId(responseId), response);
  removeRequestFromPool(responseId);
}

export {
  isRequestTypeInRules,
  isResponseTypeInRules,
  wrapMessage2Request,
  wrapMessage2Response
};
