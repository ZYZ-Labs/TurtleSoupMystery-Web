import axios from 'axios'

/**
 * http get请求
 * @param option
 */
function get<T>(option: HttpOption): Promise<T> {
    return new Promise((resolve, reject) => {
        axios.get(option.url, {
            headers: option.headers,
            params: option.params
        }).then((res) => resolve(res.data)).catch(reject)
    })
}

/**
 * http post请求
 * 内容是json
 * @param option
 */
function postJson<T>(option: HttpOption): Promise<T> {
    if (option.headers['content-type'] !== 'application/json') {
        option.headers['content-type'] = 'application/json'
    }
    return new Promise((resolve, reject) => {
        axios.post(option.url, {
            headers: option.headers,
            data: option.data
        }).then((res) => resolve(res.data)).catch(reject)
    })
}

/**
 * http post请求
 * 内容是form
 * @param option
 */
function postForm<T>(option: HttpOption): Promise<T> {
    if (option.headers['content-type'] !== 'application/x-www-form-urlencoded') {
        option.headers['content-type'] = 'application/x-www-form-urlencoded'
    }
    return new Promise((resolve, reject) => {
        axios.post(option.url, {
            headers: option.headers,
            params: option.params
        }).then((res) => resolve(res.data)).catch(reject)
    })
}

class HttpOption {
    url: string
    headers: Record<string, any>
    params: Record<string, any>
    data: string

    constructor(url: string, headers: Record<string, any> = {}, params: Record<string, any> = {}, data: string = "") {
        this.url = url
        this.headers = headers
        this.params = params
        this.data = data
    }
}

export {get, postJson, postForm}