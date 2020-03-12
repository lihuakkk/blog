> localstrage封装

优点：

* 只需要设置一次key
* 不需要关心数据类型

用例：

```javascript
import localName from 'localName';

localName.set('gittttt')
localName.get() // gittttt

localName.remove() 
localName.get() // null


```