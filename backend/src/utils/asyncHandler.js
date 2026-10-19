/**
 * Express 4 不会自动捕获 async handler 的 Promise rejection。
 * 没有这层包装时，一次数据库/短信驱动异常会变成 unhandled rejection，
 * Node 22 默认直接退出进程，而不是返回 500。
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
