import storage from './main';

const cache = Object.create(null);

function get(key) {
  return cache[key] || storage.get(key);
}

function set(key, value) {
  cache[key] = value;
  return storage.set(key, value);
}

function remove(key) {
  cache[key] = null
  storage.remove(key)
}

export default {
  get,
  set,
  remove
}