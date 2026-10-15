<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const router = useRouter()

// 路由 ready 之前不渲染任何布局，避免首帧路由尚未解析时
// 「侧边栏先出现、随后再跳转」的闪动。
const ready = ref(false)

const isLandingPage = computed(() => route.name === 'landing')

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
    <AppLayout v-if="!isLandingPage">
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
