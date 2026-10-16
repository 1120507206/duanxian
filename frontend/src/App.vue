<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const router = useRouter()

// 路由 ready 之前不渲染任何布局，避免首帧路由尚未解析时
// 「侧边栏先出现、随后再跳转」的闪动。
const ready = ref(false)

/**
 * 不套站点外壳（AppLayout）的页面：
 *   - 落地页：自带营销视觉，套上侧边栏会先闪一下再跳走；
 *   - 运营后台：管理员界面。套站点外壳有两个实际危害 ——
 *     一是首访的「风险提示」弹窗会整页盖住后台登录表单（它默认打开，
 *     而管理员多半是本机第一次访问，必然撞上）；二是后台自己已有完整壳层，
 *     再叠一层侧边栏只会互相干扰。
 * 判断用前缀而不是路由名，是为了以后新增后台子页时不用再改这里。
 */
const isStandalonePage = computed(
  () => route.name === 'landing' || String(route.path).startsWith('/admin'),
)

onMounted(async () => {
  // 等首个路由 resolve（含 redirect），确保首帧渲染的就是目标页。
  await router.isReady()
  ready.value = true
})
</script>

<template>
  <!-- ready 前渲染与目标页背景同色的最小占位，避免白闪/黑闪与布局跳变 -->
  <div v-if="!ready" class="app-boot" />
  <template v-else>
    <AppLayout v-if="!isStandalonePage">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </AppLayout>
    <router-view v-else />
  </template>
</template>

<style>
.app-boot {
  min-height: 100vh;
  background: var(--color-bg-base);
}
</style>
