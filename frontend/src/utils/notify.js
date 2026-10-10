const EVENT_NAME = 'duanxian:notify'

export function notify(payload) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: {
      type: 'warning',
      message: '请求失败，请稍后重试',
      ...payload,
    },
  }))
}

export function onNotify(handler) {
  const listener = (event) => handler(event.detail)
  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}
