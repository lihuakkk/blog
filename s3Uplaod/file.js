/**
 * Notice
 * 此文件均为文件相关的函数， 互相之间可能有依赖关系，迁移时请注意
 */
import { deviceId } from '@/common/js/config';
import SparkMD5 from 'spark-md5'

export function formatFileSize(size) {
  if(size != Number(size)) {
    console.error('参数必须为数字或纯数字字符串')
    return
  }
  size = Number(size)
  let num = 0
  if (size === 0) {
    return num = '0G'
  }
  if (size < 1024) {
    num = '1KB'
  } else if (size >= 1024 && size < 1024 * 1024) {
    num = `${(size / 1024).toFixed(0)} KB`;
  }else if (size >= 1024 * 1024 && size < 1024 * 1024 * 1024) {
    num = `${(size / 1024 / 1024).toFixed(2)} MB`;
  } else {
    num = `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  }
  return num
}

// 根据文件名获取文件的扩展名
export const getExtensionName = (name) => {
  if(typeof name !== 'string' && name.indexOf('.') === -1) {
    console.error('未知文件类型')
    return '未知类型'
  }
  let filename = name.toUpperCase()
  let extensionArr = filename.split('.')
  let extensionName = extensionArr[extensionArr.length - 1]
  // 扩展名超过4位的截取前4位
  return extensionName.length > 4 ? extensionName.slice(0,4) : extensionName
}

export function fileIsVideo(filename) {
  if(typeof filename !== 'string' || !filename) {
    console.error('文件名/文件类型 参数必须存在且为字符串类型')
    return ''
  }
  let lowerName = filename.toLowerCase()
  /**
   * 针对部分 系统无法播放的 部分格式视频，当文件处理（mov,flv等格式）
   */
  return /[.](mp4|mov|rmvb|avi|ogg)$/.test(lowerName)
}

export function fileIsImg(filename) {
  if(typeof filename !== 'string' || !filename) {
    console.error('文件名/文件类型 参数必须存在且为字符串类型')
    return ''
  }
  let lowerName = filename.toLowerCase()
  return /[.](png|jpg|jpeg|gif|bmp|svg|webp)$/.test(lowerName)
}

/**
 * 判断是否是文件夹
 * 针对拖拽事件
 * 暂时只支持chrome
 * @param {*} e e为拖拽时的e
 */
export const isMunltiFile = (e) => {
  // 默认是文件 而不是文件夹
  let isFile = false
  let items = e.dataTransfer && e.dataTransfer.items
  if(items) {
    for (let i = 0; i < items.length; i++) {
      console.log(items[i].webkitGetAsEntry().isFile)
      if(!items[i].webkitGetAsEntry().isFile) {
        isFile = true
      }
    }
  } else {
    // 手动上传情况
    let files = Array.prototype.slice.call(e.target.files)
    files.map(item => {
      if(!(/.\../.test(item.name)) && !item.type) {
        isFile = true
      }
    })
  }
  console.log('isFile:', isFile)
  return isFile
}

export const getObjectURL = (file) => {
  if (window.createObjectURL!=undefined) { // basic
    return window.createObjectURL(file) ;
  } else if (window.URL!=undefined) { // mozilla(firefox)
    return window.URL.createObjectURL(file) ;
  } else if (window.webkitURL!=undefined) { // webkit or chrome
    return window.webkitURL.createObjectURL(file) ;
  }
}
/**
 * 文件名特殊字符过滤,在没有encode过程情况下，上传带有特殊字符的文件 路径会访问错误
 * @param {*} string
 */
export const filterCharCode = (string) => {
  let pattern = new RegExp("[`~!@#$^&*()=|{}':;',\\[\\]<>/?~！@#￥……&*（）——|{}【】‘；：”“'。，、？]")
  let rs = ''
  for (let i = 0; i < string.length; i++) {
    rs = rs + string.substr(i, 1).replace(pattern, '');
   }
   // 过滤空格
  let trimStr = rs.replace(/ /g, '_')
  return trimStr
}

/**
 * 判断图片压缩比例，使得大图片能够被充分压缩
 * @param { Number } type 1:小缩略图 2：大缩略图
 */
export const calCompressRatio = (ImgWidth, ImgHeight, type) => {
  let constant = 960
  if(type === 1) {
    if(ImgWidth < 320 || ImgHeight < 320) { // 不压缩
      return 1
    }
      return ImgWidth > ImgHeight ? 320/ImgHeight : 320/ImgWidth
  } else {
    if(ImgWidth < constant || ImgHeight < constant) {
      return 1
    }
    return ImgWidth > ImgHeight ? constant/ImgHeight : constant/ImgWidth
  }
}

// 格式化视频时长
export function formatPeriod(sec) {
  let intSec = parseInt(sec)
  if(intSec < 60) {
    return `00:${numFormat(intSec)}`
  } else if(intSec < 3600) {
    return `${numFormat(parseInt(intSec/60))}:${numFormat(intSec%60)}`
  } else {
    return `${numFormat(parseInt(intSec/3600))}:${numFormat(parseInt((intSec%3600)/60))}:${numFormat((intSec%3600)%60)}`
  }
}
// 将个位数的数字前面加0
export function numFormat(str) {
  str = str.toString()
  if (str.length < 2) {
    return `0${str}`
  }
  return str
}

// 文件上传前计算 
export function calFileMD5(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    const chunkSize = 2097152; // 2MB
    let currentChunk = 0
    let spark = new SparkMD5.ArrayBuffer()
    let chunks = Math.ceil(file.size / chunkSize)
    let blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice
    fileReader.onload = function(e) {
      const fileResult = e.target.result
      spark.append(fileResult)
      currentChunk++
      if(currentChunk < chunks) {
        loadNext()
      } else {
        try {
          const md5 = spark.end()
          file.fileMd5 = md5
          resolve(md5)
        } catch(e) {
          reject()
        }
      }
    }

    function loadNext() {
      let start = currentChunk * chunkSize
      let end = (start + chunkSize) >= file.size ? file.size : (start + chunkSize)
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
    }

    loadNext()
  })
}

export function renameFile(file) {
  let _file;
  try {
    _file = new File([file], String(Date.now()) + file.name, {
      type: file.type
    });
  } catch (e) {
    // edge compation
    _file = file;
  }
  return _file;
}