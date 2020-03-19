> aws s3 上传封装

> npm i aws-sdk spark-md5 --save 

功能：

- 单/多文件上传
- 上传取消
- 视频/图片缩略图上传
- 上传进度
- 上传速度
- 上传失败回调
- 上传成功回调

用例：

```javascript
import uploadFileFactory from 'index';
/*
* fileList Array[formatFile]
* formatFile = {
  file: File, // 本地文件
  name,
  type,  // PICTURE | VIDEO | DOC 
  size,
  fileId,
  key,
  bucket,
  uploadStatus: 'wait', // 'wait' | 'uploading' | 'finished' | 'failed'
}
**/
const uploadCancel = uploadFileFactory(
  fileList,
  function onprogress(data) {
    // progress && speed
    console.log('progress', data);
  },
  function onerror(error) {
    console.log(error);
  },
  function onend() {
    console.log('end');
  }
);

uploadCancel(); // 取消上传
```
