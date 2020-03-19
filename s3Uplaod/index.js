import { fileIsImg, fileIsVideo } from 'file';
import { uploadFileByS3, uploadThumbnailByS3, abortS3UploadRequest } from 'upload';

function noop() {}

function calculatorFileTotalSize(fileList) {
  return fileList.reduce((accumulator, file) => accumulator + file.size, 0)
}

// TODO OPT
// 1、支持多个任务并行上传 （3个）
// 2、多文件上传，记录已经上传完成的文件，并更新文件状态
// 3、上传速度计算计算
// 4、代码优化
//
/*
 options = {
   // 单个文件上传成功的回调
   onFileFinished: () => {

   }
 }
*/

function uploadFileFactory(fileList, onprogress, onerror, onend, options = {}) {
  let _fileList;
  let _uploadInfo;
  let _s3UploadRequest; // s3 Upload Request
  let _onprogress;
  let _onerror;
  let _onend;
  let _onFileFinished;

  return upload(fileList, onprogress, onerror, onend, options)

  function init(fileList) {
    _fileList = [].concat(fileList);
    _uploadInfo = getDefaultUploadInfo(calculatorFileTotalSize(_fileList));
  }

  function getDefaultUploadInfo(totalSize) {
    return {
      totalSize,
      speed: 0,
      uploadedSize: 0,
      uploadedSizeBase: 0
    }
  }

  function updateUploadProgress(uploadInfo) {
    _uploadInfo.progress = (
      ((_uploadInfo.uploadedSizeBase + uploadInfo.uploadedSize) / _uploadInfo.totalSize) *
      100
    ).toFixed(2);
  }

  function updateUploadedSpeed(uploadInfo) {
    _uploadInfo.speed = uploadInfo.speed;
  }

  function updateUploadedSize(uploadInfo) {
    _uploadInfo.uploadedSize = uploadInfo.uploadedSize + _uploadInfo.uploadedSizeBase;
  }

  function updateUploadedSizeBase(uploadInfo) {
    _uploadInfo.uploadedSizeBase += uploadInfo.totalSize;
  }

  function getBackupFilelist() {
    return [].concat(_fileList);
  }

  function cancel() {
    abortS3UploadRequest(_s3UploadRequest)
  }

  function upload(fileList, onprogress, onerror, onend, options) {
    init(fileList)
    _onprogress = onprogress
    _onerror = onerror
    _onend = onend
    _onFileFinished = options.onFileFinished || noop;
    uploadFileList(getBackupFilelist())
    return cancel;
  }

  function uploadFileList(fileList) {
    console.log('uploadFileList fileList', fileList);
    if (fileList.length === 0) {
      console.log('on end');
      _onend && _onend();
      return;
    }
    const file = fileList.shift();
    if (file.uploadStatus === 'finished') {
      updateUploadedSize({
        uploadedSize: file.size
      });
      updateUploadProgress({
        uploadedSize: file.size
      });
      updateUploadedSizeBase({
        totalSize: file.size
      })
      uploadFileList(fileList);
    } else {
      file.uploadStatus = 'uploading';
      _s3UploadRequest = uploadFileByS3(
        file,
        function progressCb(uploadInfo) {
          console.log('upload fileList progressCb', uploadInfo);
          updateUploadedSpeed(uploadInfo);
          updateUploadedSize(uploadInfo);
          updateUploadProgress(uploadInfo);
          uploadInfo.progress === 100 && updateUploadedSizeBase(uploadInfo);
          _onprogress(_uploadInfo);
        },
        function errorCb(error) {
          console.log('upload fileList errorCb', error);
          try {
            if (error.errorMsg.message === 'Network Failure') {
              console.log('网络异常，请检查网络')
            }
          } catch(e) {
            console.log('upload FileList catch error', e)
          }
          file.uploadStatus = 'failed';
          _onerror(error);
        },
        function endCb(end) {
          // todo: update file status
          console.log('upload fileList endCb', end);
          file.uploadStatus = 'finished';
          _onFileFinished(file)
          uploadFileList(fileList);
        }
      )
    }
  }
}

function uploadThumbnail(fileList, onerror, onend) {
  console.log('upload Thumbnail ByS3', fileList);
  if (fileList.length === 0) {
    console.log('on end');
    onend && onend();
    return;
  }
  const file = fileList.shift();
  if (file.uploadStatus === 'finished') {
    uploadThumbnail(fileList, onerror, onend);
  } else {
    uploadThumbnailByS3(file, function errorCb() {
      file.uploadStatus = 'failed';
      onerror && onerror()
    }, function endCb(end) {
      console.log('upload Thumbnail endCb', end);
      file.uploadStatus = 'finished';
      uploadThumbnail(fileList, onerror, onend);
    });
  }
}

export { uploadFileFactory, uploadThumbnail };
