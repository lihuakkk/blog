import { calCompressRatio, formatFileSize, getObjectURL } from 'file';
import AWS from 'aws-sdk/global';
import S3 from 'aws-sdk/clients/s3';

function noop() {}

// 直接参考s3.d.ts或者通过下面的文档链接
// https://docs.aws.amazon.com/zh_cn/sdk-for-javascript/v2/developer-guide/webpack.html // s3引入方式介绍
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html // s3文档

const chinaCountryCode = '86';
const americaCountryCode = '1';
const defaultCountryCode = americaCountryCode;
const chinaEndPoint = new AWS.Endpoint('https://s3.cn-northwest-1.amazonaws.com.cn');
let S3SdkKeyArr = [];

export function uploadByS3Sdk(file, uploadtype, thumstype, progressCb, errorCb, endCb) {
  // uploadtype 1:原文件和normal缩略图文件 2.large缩略图
  // thumstype 1:normal缩略图 2:large缩略图

  const accessKeys = getAccessKey();
  if (!accessKeys) {
    return false;
  }
  const { accessKeyId, secretAccessKey } = accessKeys;
  return s3Upload(
    accessKeyId,
    secretAccessKey,
    file,
    uploadtype,
    thumstype,
    progressCb,
    errorCb,
    endCb
  );
}

export function setAccesskey(accessKeys) {
  S3SdkKeyArr = accessKeys;
}

function getAccessKey() {
  return (
    S3SdkKeyArr.find(item => item.countryCode === cc()) ||
    S3SdkKeyArr.find(item => item.countryCode === defaultCountryCode)
  );
}

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#abortMultipartUpload-property
export function abortUpload(params = {}) {
  request.abort();
}

export function abortS3UploadRequest(uploadRequest) {
  uploadRequest && uploadRequest.abort();
}

function s3Upload(
  accessKeyId,
  secretAccessKey,
  file,
  uploadtype,
  thumstype,
  progressCb,
  errorCb,
  endCb
) {
  /**
   * 全局对象配置：https://docs.aws.amazon.com/zh_cn/sdk-for-javascript/v2/developer-guide/setting-region.html
   * 解决第一次上传总是有400错误的bug
   */
  AWS.config.update({
    accessKeyId,
    secretAccessKey,
    region: file.key.split('/')[0]
  });

  let key;
  let bucket;
  let uploadfile;
  if (uploadtype === 1) {
    key = file.key;
    bucket = file.bucket;
  } else {
    key = file.key2;
    bucket = file.bucket2;
  }
  uploadfile = thumstype === 2 ? file.blob : file.file;

  const s3Options = Object.assign(
    {
      params: {
        Bucket: bucket,
        Key: key // 要上传的档案名称
      },
      httpOptions: {
        timeout: 0
      },
      useAccelerateEndpoint: true // 开启上传加速服务，提升上传速度， 中国区除外
    },
    cc() === chinaCountryCode ? { endpoint: chinaEndPoint, useAccelerateEndpoint: false } : {}
  );

  const s3 = new S3(s3Options);

  const request = s3.upload({
    Body: uploadfile,
    Bucket: bucket,
    Key: key
  });

  // 原函数定义: https://github.com/aws/aws-sdk-js/blob/a203c0e23010e256c88092a0be1e66a7a392eedf/lib/services/s3.js#L629
  // 这里一定要调用done()
  AWS.util.update(S3.prototype, {
    reqRegionForNetworkingError(resp, done) {
      done();
    }
  });

  request
    .on('httpUploadProgress', evt => {
      progressCb && progressCb(evt);
    })
    .send((err, data) => {
      if (err) {
        console.log('S3 Request Send Error：', err.toString());
        errorCb(err);
      } else {
        console.log('S3 Request Send finished', data);
        endCb && endCb();
      }
    });
  return request;
}

export function onProgressNew(uploadType, file, evt, type, ot, oloaded) {
  const percent = ((evt.loaded / evt.total) * 100).toFixed(0);
  const nt = new Date().getTime();
  const pertime = (nt - ot) / 1000; // 计算出上次调用该方法时到现在的时间差，单位为s
  const perload = evt.loaded - oloaded; // 计算该分段上传的文件大小，单位b
  oloaded = evt.loaded; // 重新赋值已上传文件大小，用以下次计算
  // 上传速度计算
  let speed = perload / pertime; // 单位b/s
  file.speed = formatFileSize(speed) + '/s';
  if (evt.loaded === evt.total) {
    return {
      speed: file.speed,
      progress: 100,
      totalSize: evt.total,
      uploadedSize: evt.loaded
    };
  } else {
    return {
      speed: file.speed,
      progress: percent,
      totalSize: evt.total,
      uploadedSize: evt.loaded
    };
  }
}
// 上传错误的处理
function onError(vm, error) {
  console.log('转为blob上传失败', error);
}
// 调用上传原文件方法

export function uploadFileNew(file, cb) {
  const ot = new Date().getTime(); // 设置上传开始时间
  const oloaded = 0;
  uploadByS3Sdk(
    file,
    1,
    1,
    evt => {
      let uploadInfo = onProgressNew(1, file, evt, 1, ot, oloaded);
      cb(uploadInfo);
    },
    err => {
      cb({ error: true, errorMsg: err });
    },
    evt => {
      cb({ progress: 101, speed: '' });
    }
  );
}

export function uploadFileByS3(file, progressCb, errorCb, endCb) {
  const ot = new Date().getTime(); // 设置上传开始时间
  const oloaded = 0;
  return uploadByS3Sdk(
    file,
    1,
    1,
    evt => {
      let uploadInfo = onProgressNew(1, file, evt, 1, ot, oloaded);
      progressCb(uploadInfo);
    },
    err => {
      errorCb({ error: true, errorMsg: err });
      console.log('error:', err);
    },
    evt => {
      endCb({ progress: 101, speed: '' });
    }
  );
}
// 调用上传缩略图方法
export function uploadFileForThum(file, cb) {
  const ot = new Date().getTime(); // 设置上传开始时间
  const oloaded = 0;
  if (file.file.fileStyle === 'PICTURE') {
    imgToBlob(file, 1, blob => {
      file.blob = blob;
      uploadByS3Sdk(
        file,
        1,
        2,
        evt => {
          onProgressNew(2, file, evt, 1, ot, oloaded);
        },
        err => {},
        () => {
          imgToBlob(file, 2, blob => {
            file.blob = blob;
            uploadByS3Sdk(
              file,
              2,
              2,
              evt => {
                onProgressNew(2, file, evt, 2, ot, oloaded);
              },
              err => {},
              () => {
                cb();
              }
            );
          });
        }
      );
    });
  } else {
    videoToBlob(file, 1, blob => {
      file.blob = blob;
      uploadByS3Sdk(
        file,
        1,
        2,
        evt => {},
        err => {},
        () => {
          videoToBlob(file, 2, blob => {
            file.blob = blob;
            uploadByS3Sdk(
              file,
              2,
              2,
              evt => {
                onProgressNew(2, file, evt, 2, ot, oloaded);
              },
              err => {
              },
              () => {
                cb();
              }
            );
          });
        }
      );
    });
  }
}

export function uploadThumbnailByS3(file, errorCb, endCb) {
  if (file.file.fileStyle === 'PICTURE') {
    imgToBlob(file, 1, blob => {
      file.blob = blob;
      uploadByS3Sdk(
        file,
        1,
        2,
        noop,
        err => {
          console.error('upload PICTURE normal thumbnail byS3 error --> file', file, err);
          errorCb(err);
        },
        () => {
          imgToBlob(file, 2, blob => {
            file.blob = blob;
            uploadByS3Sdk(
              file,
              2,
              2,
              noop,
              err => {
                console.error('upload PICTURE large thumbnail byS3 error --> file', file, err);
                errorCb(err);
              },
              endCb
            );
          });
        }
      );
    });
  } else {
    videoToBlob(file, 1, blob => {
      file.blob = blob;
      uploadByS3Sdk(
        file,
        1,
        2,
        noop,
        err => {
          console.error('upload VIDEO normal thumbnail byS3 error --> file', file, err);
          errorCb(err);
        },
        () => {
          videoToBlob(file, 2, blob => {
            file.blob = blob;
            uploadByS3Sdk(
              file,
              2,
              2,
              noop,
              err => {
                console.error('upload VIDEO large thumbnail byS3 error --> file', file, err);
                errorCb(err);
              },
              endCb
            );
          });
        }
      );
    });
  }
}

function imgToBlob(file, type, cb) {
  // type 缩略图种类 1：normal缩略图 2：large缩略图
  // const img = document.createElement('img');
  const img = new Image();
  img.src = getObjectURL(file.file);
  img.onload = function() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let ratio = calCompressRatio(img.width, img.height, type);
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      blob => {
        cb(blob);
      },
      'image/jpg',
      0.7
    );
  };
}

function videoToBlob(file, type, cb) {
  // type 缩略图种类 1：normal缩略图 2：large缩略图
  const video = document.createElement('video');
  const windowURL = window.URL || window.webkitURL;
  video.src = windowURL.createObjectURL(file.file);
  video.setAttribute('preload', 'auto');
  video.onloadeddata = function(evt) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let scale = calCompressRatio(this.videoWidth, this.videoHeight, type);
    canvas.width = (this.videoWidth || 240) * scale;
    canvas.height = (this.videoHeight || 180) * scale;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      blob => {
        cb(blob);
      },
      'image/jpg',
      0.7
    );
  };
}

/**
 * 新版文件上传流程
 * @param { Array } files 文件列表
 * @param { Number} index 上传文件index
 * @param { Function} callback
 */
export function onS3UploadFile(files, index = 0, callback, params = {}) {
  // 后端获取授权信息, region, accessKeyId, accessKeySecret,bucket, key
  // params = {
  //   region: '',
  //   accessKeyId: '',
  //   accessKeySecret: '',
  //   Bucket: '',
  //   Key: ''
  // }
  if (index !== files.length) {
    const client = new S3(params);
    request = client.upload({
      Body: files[index],
      Bucket: '',
      Key: ''
    });
    AWS.util.update(S3.prototype, {
      reqRegionForNetworkingError(resp) {
        if (AWS.util.isBrowser()) {
          console.log('捕获sdk错误--:', resp);
          if (resp.error && resp.error.statusCode !== 400) {
            callback({
              error: true,
              errorMsg: resp.error.message
            });
          }
        }
      }
    });
    request
      .on('httpUploadProgress', evt => {
        let timestamp = new Date().getTime();
        let uploadInfo = onUploadProgress(evt, timestamp, 0);
        callback(uploadInfo);
      })
      .send(err => {
        if (!err) {
          onS3UploadFile(files, index + 1, callback, params);
        } else {
          callback({ error: true, errorMsg: err });
        }
      });
  } else {
    // 所有文件均上传完成
    callback('success');
  }
}

function onUploadProgress(evt, ot, oloaded) {
  const percent = ((evt.loaded / evt.total) * 100).toFixed(0);
  const nt = new Date().getTime();
  const pertime = (nt - ot) / 1000; // 计算出上次调用该方法时到现在的时间差，单位为s
  const perload = evt.loaded - oloaded; // 计算该分段上传的文件大小，单位b
  oloaded = evt.loaded; // 重新赋值已上传文件大小，用以下次计算
  // 上传速度计算
  let speed = perload / pertime; // 单位b/s
  file.speed = formatFileSize(speed) + '/s';
  if (evt.loaded === evt.total) {
    return {
      speed: file.speed,
      progress: 100,
      totalSize: evt.total,
      uploadedSize: evt.loaded
    };
  } else {
    return {
      speed: file.speed,
      progress: percent,
      totalSize: evt.total,
      uploadedSize: evt.loaded
    };
  }
}
