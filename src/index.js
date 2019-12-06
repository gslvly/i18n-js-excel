const { toString } = Object.prototype
const isObj = val => toString.call(val) === '[object Object]'
const isArr = val => toString.call(val) === '[object Array]'
// 百度翻译的目标语言
window.toBaiduTransLang = {
  'zh-CN': 'zh',
  'en-us': 'en',
  'ru-RU': 'ru',
  es: 'spa',
  ja: 'jp',
  'ja-JP': 'jp'
}
window.toAutoLang = {
  zh: 'zh-CN',
  ru: 'ru-RU',
  spa: 'es',
  jp: 'ja'
}

const reader = new Proxy(Object.create(null), {
  get(target, key) {
    return function(val) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => {
          resolve(reader.result)
        }
        reader.onerror = _ => {
          reject(reader.error)
        }
        reader[key](val)
      })
    }
  }
})
/**
 * @return [{zh-CN:名字, en: 'name'}] ||
 */
const getXLSLdata = async (file, sheetName) => {
  let buffer = await reader.readAsArrayBuffer(file)
  buffer = new Uint8Array(buffer)
  const workbook = XLSX.read(buffer, { type: 'array' })
  console.log('所有sheetName:', workbook.SheetNames)
  if (workbook.SheetNames.indexOf(sheetName) === -1)
    throw `sheetName：${sheetName} is not in ${JSON.stringify(
      workbook.SheetNames
    )}`
  const toJSON = sheetName =>
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

  if (sheetName) {
    return toJSON(sheetName)
  }
  return Object.values(workbook.SheetNames).map(toJSON)
}
/**
 *
 * @param {a:1,b:{c:'啥子'}} tempStr
 * @param {[{'zh-CN':'嗯',en:'enen'}]} excelData
 * @param {'zh-CN'} tempLang
 * @param  {true or false} isUseBaidu
 * @returns {'zh-CN': str, en:'str2',...}
 */
const getLangObjByTemp = async function({
  tempStr,
  excelData = [],
  tempLang,
  isUseBaidu,
  toLangs
}) {
  const data = {}
  toLangs = toLangs.filter(it => it !== tempLang)
  const cObj = {} // {你好：{'zh-CN':'你好',en:'hello'}}
  excelData.forEach(it => {
    cObj[it[tempLang]] = it
  })
  const reg =/(?<=:\s*["'`]{1}\s*)(?=\S).*(?=\s*['"`]{1}\s*[\n,}])/g

  const values = tempStr.match(reg)
  if (isUseBaidu) {
    const needbaiduTrans = toLangs
      .map(lang => {
        const needTrans = values.filter(
          value => !cObj[value] || !cObj[value][lang]
        )
        if (needTrans.length) {
          return {
            from: tempLang,
            to: lang,
            q: [...new Set(needTrans)]
          }
        }
      })
      .filter(Boolean)

    /**
     * baiduback: [{form:'zh',to='en', trans_result:[{src:'我是谁',dst:'who are you'}]}]
     */
    const baiduBack = await Promise.all(needbaiduTrans.map(trans))
    baiduBack.forEach(it => {
      const toLang = it.to
      const result = it.trans_result
      result.forEach(res => {
        if (!cObj[res.src]) {
          cObj[res.src] = {}
        }
        if (!cObj[res.src][toLang]) {
          cObj[res.src][toLang] = res.dst
        }
      })
    })
  }

  toLangs.map(lang => {
    if (lang === tempLang) return
    data[lang] = tempStr.replace(reg, function(value) {
      return (cObj[value] && cObj[value][lang]) || ''
    })
  })

  return data
}

/**
 *
 * @param {Array [{'zh-CN':'啥',en: 'a', key:'a.b.c'}]} excelData
 */
const getLangObjByKey = async function({ excelData, isUseBaidu, toLangs }) {
  const data = {}

  toLangs.forEach(lang => (data[lang] = {}))
  function setKeyObj(keypath, value, obj) {
    keypath = keypath.split('.')
    const lastKey = keypath.pop()

    const obj2 = keypath.reduce(
      (obj, key) => (obj[key] = isObj(obj[key]) ? obj[key] : {}),
      obj
    )

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch (e) {}
      if (typeof value === 'number') {
        value = '' + value
      }
    }

    obj2[lastKey] = value
  }
  toLangs.forEach(lang => {
    data[lang] = {}
  })

  // const needbaiduTrans = {} // {'zh-CN':[{to:'es',value:'翻译成es语言'}], en:[]}
  const needbaiduTrans = {} // {'zh-CN': {es: [{q:'从中文翻译到es文', key:'a.b.c'}]}}
  excelData.forEach(it => {
    const { key, ...obj } = it
    if (!key) {
      return
    }

    // 找到有翻译的数据，如果其他语言缺少值，则从此值去翻译成目标值
    /**
     * find:[lang,value]
     */
    let find
    if (obj['zh-CN']) {
      find = ['zh-CN', obj['zh-CN']] // 中文优先作为源语言
    } else {
      find = Object.entries(obj).find(([lang, value]) => value)
    }

    for (let lang of toLangs) {
      if (!data[lang]) continue
      const value = obj[lang]
      setKeyObj(key, value, data[lang])
      if (isUseBaidu && !value && find) {
        const [tempLang, q] = find
        if (!needbaiduTrans[tempLang]) {
          needbaiduTrans[tempLang] = {}
        }
        if (!needbaiduTrans[tempLang][lang]) {
          needbaiduTrans[tempLang][lang] = []
        }
        needbaiduTrans[tempLang][lang].push({ q, key })
      }
    }
  })
  // [{from: 'zh', to="en",q:['我是谁','你是谁']}]
  for (let [tempLang, tempLangData] of Object.entries(needbaiduTrans)) {
    for (let [toLang, originData] of Object.entries(tempLangData)) {
      const { q, cObj } = originData.reduce(
        (pre, next) => {
          pre.q.push(next.q)
          pre.cObj[next.q] = next.key
          return pre
        },
        { q: [], cObj: {} }
      )

      const backdata = await trans({ from: tempLang, to: toLang, q })
      
      backdata.trans_result.forEach((it, index) => {
        setKeyObj(cObj[it.src], it.dst, data[toLang])
      })
    }
  }

  toLangs.forEach(lang => {
    data[lang] = `export default  ${JSON.stringify(data[lang])}`
  })
  return data
}

const download = function(str, name) {
  const a = document.createElement('a')
  document.body.appendChild(a)
  const data = new Blob([str])
  a.href = URL.createObjectURL(data)
  a.download = name
  a.click()
  document.body.removeChild(a)
}
/**
 *
 * @param {Object {"zh-CN":{title:'sdf'}}} locales
 * @param {Boolean} needPath
 * @return {Array [{"zh-CN":'哈哈', en:'haha'},...]}
 */
const jsonsToArray = function(locales, needPath = true) {
  let langs = Object.keys(locales), // ['zh-CN', 'en'...]
    jsons = JSON.parse(JSON.stringify(Object.values(locales)))

  const datas = []

  function go(jsons, path = []) {
    const keys = getKeys(jsons)

    keys.forEach(key => {
      const nwPath = [...path, key]
      const values = jsons.map(json => {
        if (!json) {
          return ''
        }
        if (isArr(json[key])) {
          return JSON.stringify(json[key])
        }
        return json[key]
      })

      let row = values.map(it => (!isObj(it) && it) || '')

      if (row.filter(it => it).length) {
        const rowObj = {}
        if (needPath) {
          rowObj.key = nwPath.join('.')
        }
        row.forEach((it, index) => {
          const lang = langs[index]
          rowObj[lang] = it
        })

        datas.push(rowObj)
      }

      const childObjArr = values.map(it => (isObj(it) && it) || '')
      if (!childObjArr.filter(it => it).length) return
      return go(childObjArr, nwPath)
    })
  }
  function getKeys(jsons) {
    const assignJson = jsons.reduce((old, nw) => {
      if (isObj(nw)) {
        return { ...old, ...nw }
      }
      return old
    }, {})
    return Object.keys(assignJson)
  }
  go(jsons)
  return datas
}
/**
 *
 * @param  {Array [{"zh-CN":'哈哈', en:'haha'},...]} arr
 */
const downloadExcel = function(arr) {
  const worksheet = XLSX.utils.json_to_sheet(arr) // 生成sheet
  const workbook = XLSX.utils.book_new() //生成book对象
  XLSX.utils.book_append_sheet(workbook, worksheet) // 将sheet添加入book

  XLSX.writeFile(workbook, 'i18n.xlsx') // 下载
}

/**
 * @param {Array [{"zh-CN":'哈哈', en:'haha'},...]} arr
 * @param {String 'zh-CN'} baseLang
 *基于baseLang去重,不传则根据元素值是否相等来去重。
 */
const noRepeat = function(arr, baseLang) {
  const data = {}
  arr.forEach(it => {
    let baseKey
    if (baseLang) {
      baseKey = it[baseLang]
    } else {
      const { path, ...data } = it

      baseKey = JSON.stringify(data)
    }
    data[baseKey] = it
  })
  return Object.values(data)
}

window.config = {
  key: 'HtH9rRtduT3mWt201Ysm',
  appid: '20191204000362867'
}

/**
 *
 * @param {from: 'zh-CN', to="en",q:['我是谁','你是谁']} param0
 * @returns {from:'zh-CN',to='en', trans_result:[{src:'我是谁',dst:'who are you'}]}
 */
async function trans({ from = 'zh-CN', to = 'en', q }) {
  from = toBaiduTransLang[from] || from
  to = toBaiduTransLang[to] || to
  const { key, appid } = window.config
  if (!q || !q.length) {
    throw '没有翻译文'
  }
  function start(q) {
    const salt = `${Date.now()}${Math.random() * 10 ** 20}`
    const sign = MD5(appid + q + salt + key)
    q = encodeURIComponent(q)
    const query = {
      dict: 1,
      tts: 1,
      sign,
      appid,
      from,
      to,
      callback: 'transcb' + salt,
      salt
    }
    let url = `https://api.fanyi.baidu.com/api/trans/vip/translate?q=${q}`

    for (let key in query) {
      url += `&${key}=${query[key]}`
    }
    const script = document.createElement('script')
    script.src = url
    document.body.append(script)

    return new Promise(resolve => {
      window['transcb' + salt] = function(val) {
        Reflect.deleteProperty(window, 'transcb' + salt)
        resolve(val)
      }
      document.body.removeChild(script)
    })
  }

  let arr = []
  if (q.length === 1) {
    arr.push(q[0])
  }
  q.reduce((pre, next, i) => {
    let add = `${pre}\n${next}`
    if (i === q.length - 1) {
      arr.push(add)
      return
    }
    if (getLength(add) > 1000) {
      // 1000个子节去请求一次
      arr.push(pre)
      return next
    }

    return add
  })

  let queryArr = []
  let first = true
  for (let it of arr) {
    if (!first) {
      await new Promise(res => {
        setTimeout(res, 2000) // 翻译间隔要求最少1秒
      })
    }
    first = false
    queryArr.push(start(it))
  }
  const resdata = await Promise.all(queryArr)

  return resdata.reduce((a, b) => {
    return {
      from: toAutoLang[a.from] || a.from,
      to: toAutoLang[a.to] || a.to,
      trans_result: [...a.trans_result, ...b.trans_result]
    }
  })
}
// 获取子节长度
function getLength(val) {
  var str = new String(val)
  var bytesCount = 0
  for (var i = 0, n = str.length; i < n; i++) {
    var c = str.charCodeAt(i)
    if ((c >= 0x0001 && c <= 0x007e) || (0xff60 <= c && c <= 0xff9f)) {
      bytesCount += 1
    } else {
      bytesCount += 2
    }
  }
  return bytesCount
}
