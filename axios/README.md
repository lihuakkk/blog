> axios 封装

功能：

- 超时报错
- 网络错误，请求重试
- 请求合并

用例：

```javascript
import { packedRequestFactroy } from 'packRequest';

function request(ids) {
  return fetch(url, {
    data: ids
  });
}

const fetchAvatar = packedRequestFactroy(request);

export { fetchAvatar };
```
