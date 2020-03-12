> websocket 封装

> 需要 npm i pubsub-js --save

功能：

- 服务器连接
- 服务器登录
- 心跳保活
- 离线检测
- 断线重连
- 重连通知
- 消息处理
  > 支持promise回调，支持重试，超时处理等
- 异常日志
- 支持同一个用户只有一个设备在线
- 
用例：

```javascript
// 消息promise封装
import { sendMessage } from 'message/index';

sendMessage({
  // pn2RequestPatch.js rules定义
  operation: 'request_offline_message',
  data: {
    /* ... */
  }
})
  .then(() => {})
  .catch(() => {})
```



