const { toString } = Object.prototype
const isObj = val => toString.call(val) === '[object Object]'
const isArr = val => toString.call(val) === '[object Array]'

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
  if(workbook.SheetNames.indexOf(sheetName) === -1) throw `sheetName：${sheetName} is not in ${JSON.stringify(workbook.SheetNames)}`
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
 * @param {'zh-CN'} temLang
 * @returns {'zh-CN': str, en:'str2',...}
 */
const getLangObjByTemp = function(tempStr, excelData, temLang) {
  const langs = Object.keys(excelData[0]).filter(it => it !== 'key')
  const data = {}
  const cObj = {} // {你好：['zh-CN':'你好',en:'hello']}
  excelData.forEach(it => {
    cObj[it[temLang]] = it
  })
  langs.map(lang => {
    if (lang === temLang) return
    data[lang] = tempStr.replace(
      /(?<=:\s*["']{1}\s*)(?=\S).*(?=\s*['"]{1}\s*[\n,])/g,
      function(value) {
        return (cObj[value] && cObj[value][lang]) || ''
      }
    )
  })
  return data
}

/**
 *
 * @param {Array [{'zh-CN':'啥',en: 'a', key:'a.b.c'}]} excelData
 */
const getLangObjByKey = function(excelData) {
  const langs = Object.keys(excelData[0]).filter(it => it !== 'key')
  const data = {}
  langs.forEach(lang => (data[lang] = {}))
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

  excelData.forEach(it => {
    const { key, ...obj } = it
    for (let [lang, value] of Object.entries(obj)) {
      setKeyObj(key, value, data[lang])
    }
  })
  langs.forEach(lang => {
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
