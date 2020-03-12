
import storage from './index';

const key = 'name';

const get = () => storage.get(key);

const set = (value) => storage.set(key, value);

const remove = () => storage.remove(key)

export default {
  get,
  set,
  remove
}
