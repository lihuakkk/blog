//
// const requestObj = {
//   key: [],
//   resolve,
//   reject,
//   promise,
// };

export function packedRequestFactroy(rqeust) {
  const apiReq = rqeust;
  const requestPool = [];
  const unpackedPool = [];
  const MAX_PACKED_NUMBER = 15;
  const delay = 0.5 * 1000;
  let timeoutId;

  function find(pool, key) {
    return pool.find(requestObj => requestObj.key === key);
  }

  function pluckResponseData(result) {
    return result.data.data;
  }

  function insertResponseData(result, data) {
    result.data.data = data;
    return result;
  }

  function packedRequest(keys) {
    const promiseArray = keys.map(key => {
      let requestObj = find(requestPool, key) || find(unpackedPool, key);

      if (!requestObj) {
        requestObj = {
          key
        };

        requestObj.promise = new Promise(function(resolve, reject) {
          requestObj.resolve = resolve;
          requestObj.reject = reject;
        });

        unpackedPool.push(requestObj);
      }

      return requestObj.promise;
    });

    checkSendCondition();

    return Promise.all(promiseArray)
      .then(results => {
        const sample = simpleClone(results[0]);
        sample.data.data = results.reduce((sum, result) => sum.concat(pluckResponseData(result)), []);
        return sample;
      })
      .catch(error => {
        throw(error)
      });
  }

  function simpleClone(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      return data;
    }
  }

  function checkSendCondition() {
    if (unpackedPool.length >= MAX_PACKED_NUMBER) {
      doSendRequest();
    }

    // 每300ms发一次
    if (!timeoutId) {
      timeoutId = setTimeout(function() {
        doSendRequest();
        timeoutId = null;
      }, delay);
    }
  }

  function doSendRequest() {
    const params = unpackedPool.map(request => request.key);
    requestPool.push(...unpackedPool);
    unpackedPool.length = 0;
    apiReq(params, 'pack')
      .then(result => {
        const successResult = JSON.stringify(result);
        const data = pluckResponseData(result);
        data.forEach(item2 => resolveSingleRequest(item2, JSON.parse(successResult)));
      })
      .catch(error => {
        const errorResult = JSON.stringify(error);
        console.log('error', error);
        params.forEach(key => rejectSingleRequest(key, JSON.parse(errorResult)));
      });
  }

  function resolveSingleRequest(item2, result) {
    const index = requestPool.findIndex(item => item.key === item2.id);
    if (index !== -1) {
      const requestObj = requestPool[index];
      const formatResult = insertResponseData(result, item2)
      requestPool.splice(index, 1);
      requestObj.resolve(formatResult);
    }
  }

  function rejectSingleRequest(key, error) {
    const index = requestPool.findIndex(item => item.key === key);
    if (index !== -1) {
      const requestObj = requestPool[index];
      requestPool.splice(index, 1);
      requestObj.reject(error);
    }
  }
  return packedRequest;
}
