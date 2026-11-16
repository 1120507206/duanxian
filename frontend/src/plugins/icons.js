/**
 * 全站用到的 Element Plus 图标白名单。
 *
 * 以前是 `import * as ElementPlusIconsVue` 全量注册（近千个图标），
 * 结果是每个入口都要多下载一整包图标。这里只保留模板里真正出现的名字：
 *   · `<el-icon><X /></el-icon>` 里没有在组件内单独 import 的；
 *   · AppLayout / AdminLayout 菜单里用字符串 `icon: 'X'` 动态渲染的。
 *
 * 新增图标时把名字加到这里即可；组件内已经显式 import 的不必重复。
 * 这份文件只被 `plugins/element.js` 动态 import，不会进落地页首屏包。
 */
export {
  // 模板中直接使用、未单独 import 的
  Download,
  Plus,
  Refresh,
  // Search 是 HTML 保留标签名，注册成 SearchIcon 避免 vue/no-reserved-component-names
  Search as SearchIcon,
  Star,

  // 侧边栏 / 后台菜单通过字符串动态渲染的
  DataAnalysis,
  Document,
  HomeFilled,
  Money,
  Monitor,
  Notification,
  Ticket,
  Timer,
  TrendCharts,
  Trophy,
  User,
  Wallet,
  WarningFilled,

  // 其它页面已在组件内 import，这里保留兜底，避免以后改动时漏注册
  ArrowLeft,
  ArrowRight,
  Check,
  CopyDocument,
  InfoFilled,
  Key,
  Lock,
  Promotion,
  UserFilled,
} from '@element-plus/icons-vue'
