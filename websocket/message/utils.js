export function pn2ResponseSuccess(response) {
  try {
    return response.data.error_code === 0;
  } catch(err) {
    console.error('operationRequestSuccess', err);
    return false;
  }
}

export function pn2ResponseTimeout(error = {}) {
  try {
    return error.Error === 'TIMEOUT';
  } catch(err) {
    console.error('operationRequestSuccess', err);
    return false;
  }
}

export function promisePendingLock(asyncFn, identity) {
  identity = identity || asyncFn.name;
  let asyncFnStatus = 'wait';
  return (...params) => {
    if (asyncFnStatus === 'wait') {
      asyncFnStatus = 'execute';
      return asyncFn(...params)
        .then(r => {
          asyncFnStatus = 'wait';
          return r;
        })
        .catch(e => {
          asyncFnStatus = 'wait';
          throw(e)
        });
    }
    asyncFnStatus = 'pendingLocked';
    return Promise.reject('pendingLocked')
  };
}

export function noop() {
  console.log('this is a noop function')
}

export function deadlinePromise(timeout = 15 * 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject({
      error: 'TIMEOUT'
    }), timeout)
  })
}