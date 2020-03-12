let namespace = '';

function isUndefined(value) {
  return typeof value === 'undefined';
}

function setNamespace(value) {
  namespace = value;
}

function getNamespacedKey(key) {
  return namespace ? `${namespace}_${key}` : key;
}

function get(key) {
  var item = localStorage.getItem(getNamespacedKey(key));
  if (!item || item === 'null') {
    return null;
  }
  try {
    return JSON.parse(item);
  } catch (e) {
    return item;
  }
}

function set(key, value) {
  if (isUndefined(value)) {
    value = null;
  }
  value = JSON.stringify(value);
  localStorage.setItem(getNamespacedKey(key), value);
}

function clear() {
  localStorage.clear();
}

function remove(key) {
  localStorage.removeItem(key);
}

export default {
  set,
  get,
  clear,
  remove,
  setNamespace
};
