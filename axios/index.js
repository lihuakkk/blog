import axios from 'axios';

axios.defaults.timeout = 20 * 1000;
axios.defaults.baseURL = process.env.VUE_APP_REQUEST_URL

const retryMap = {};

const defaultRetryConfig = {
  retries: 3,
  retryCount: 0,
  retryDelay: count => count * 1000
}

const getRetryConfig = (url) => {
  if (!url) return false;
  if (!retryMap[url]) {
    retryMap[url] = Object.assign({}, defaultRetryConfig);
  }
  return retryMap[url];
};

// TODO axios custom config 可用 或者axios-retry可用
// 同一个请求同时请求多次会导致重试无效
// 当前只针对网络波动导致的Network Error进行重试
axios.interceptors.response.use((response) => {
  const config = response.config;

  if(config) {
    const url = config.url;
    const retryConfig = getRetryConfig(url);
    retryConfig && (retryConfig.retryCount = 0);
  }

  return response;
}, (error) => {
  const config = error.config;
  const isNetworkError = error.toString().includes('Network Error');
  const isTimeoutError = error.toString().toLocaleLowerCase().includes('timeout');
  const retryCondition = () => isNetworkError || isTimeoutError;


  // If we have no information to retry the request
  if (!config || !retryCondition()) {
    throw(error);
  }

  const url = config.url;
  const retryConfig = getRetryConfig(url);

  if (retryConfig && (retryConfig.retryCount < retryConfig.retries)) {
    retryConfig.retryCount++;
    return new Promise(resolve => setTimeout(() => resolve(axios(config)), retryConfig.retryDelay(retryConfig.retryCount)));
  }

  // 三次重试结束
  retryConfig.retryCount = 0;

  throw(error);
});

export function get(url, params) {
    return new Promise((resolve, reject) => {
      axios
        .get(url, { params })
        .then(response => {})
        .catch(error => {});
    });
  }
  
  export function fetch(url, params) {
    return new Promise((resolve, reject) => {
      axios
        .post(url, params)
        .then(response => {})
        .catch(error => {});
    });
  }
  
  // 自定义axios options
  // 覆盖全局axios配置，如timeout
  export function customFetch(url, params) {
    return new Promise((resolve, reject) => {
      axios({
        url,
        method: 'post',
        timeout: 5 * 1000,
        data: params,
      })
        .then(response => {})
        .catch(error => {});
    });
  }