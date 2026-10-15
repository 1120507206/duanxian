<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const isLandingPage = computed(() => route.name === 'landing')
</script>

<template>
  <AppLayout v-if="!isLandingPage">
    <router-view />
  </AppLayout>
  <router-view v-else />
</template>
