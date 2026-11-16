import 'dotenv/config'
import { fileURLToPath } from 'node:url'

export default {
  port: Number(process.env.PORT) || 8080,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  ztliveSourceUrl: process.env.ZTLIVE_SOURCE_URL || 'https://ds.duanxianxia.com/vendor/stockdata/ztlive_all.json',

  // ── 实时事件流（Socket.IO 中转）────────────────────────────────
  // 上游封板推送频道。这是**事件流**（封板/炸板瞬间推一条），与上面的全量快照互补：
  // 快照负责「表格全貌 + 统计」，事件流负责「瞬时播报 + 新行置顶」。
  // 关闭开关（ZTLIVE_WS_ENABLED=0）时后端不建连，前端自动回落成纯轮询。
  //
  // 协议是 dxx-ws-v2（Socket.IO v4）：地址是 origin，`/dxx` 是 **path 参数**不能拼进 URL；
  // 封板频道是 namespace `/ztlive`、事件名 `zt`；只支持 websocket 传输。
  ztliveWsEnabled: process.env.ZTLIVE_WS_ENABLED !== '0',
  ztliveWsUrl: process.env.ZTLIVE_WS_URL || 'https://t.duanxianxia.com',
  ztliveWsPath: process.env.ZTLIVE_WS_PATH || '/dxx',
  ztliveWsNamespace: process.env.ZTLIVE_WS_NAMESPACE || '/ztlive',
  ztliveWsEvent: process.env.ZTLIVE_WS_EVENT || 'zt',
  // 上游服务端不下发中间证书，Node 补不齐信任链 —— 用这个文件补齐（见 ztliveSocketService）
  ztliveWsCaFile: process.env.ZTLIVE_WS_CA_FILE
    || fileURLToPath(new URL('../../certs/intermediate.pem', import.meta.url)),

  // 事件流是否只发给会员。默认关：行情快照本来就是公开数据，事件流只是「更快」，
  // 而语音播报的付费门闩在客户端（useZtVoice）。想把它变成付费墙就设成 1。
  ztliveStreamRequireMember: process.env.ZTLIVE_STREAM_REQUIRE_MEMBER === '1',
  // SSE 并发连接上限，防止异常客户端把文件描述符吃光
  ztliveStreamMaxClients: Number(process.env.ZTLIVE_STREAM_MAX_CLIENTS) || 500,
}
