<template>
  <v-navigation-drawer
    :model-value="drawer"
    @update:model-value="$emit('update:drawer', $event)"
    :rail="rail"
    mobile-breakpoint="lg"
    elevation="0"
    border="0"
    class="sidebar-nav"
  >
    <div class="pa-5">
      <BrandMark />
    </div>

    <v-list nav class="px-3">
      <v-list-subheader>Control Center</v-list-subheader>
      <v-list-item
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :active="route.path.startsWith(item.to)"
        rounded="lg"
        class="mb-1"
      >
        <template #prepend>
          <v-icon :icon="item.icon" />
        </template>
        <v-list-item-title>{{ item.label }}</v-list-item-title>
        <v-list-item-subtitle>{{ item.caption }}</v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <template #append>
      <div class="pa-4">
        <v-sheet rounded="xl" color="rgba(31,111,235,0.08)" class="pa-4">
          <div class="text-subtitle-2 font-weight-bold mb-1">MVP 节奏</div>
          <div class="text-body-2 text-medium-emphasis">
            固定谜题、单人问答、Ollama 主持与会话存档。
          </div>
        </v-sheet>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { mdiCogOutline, mdiHistory, mdiPlayBoxMultipleOutline, mdiViewDashboardOutline } from '@mdi/js';
import { useRoute } from 'vue-router';
import BrandMark from './BrandMark.vue';

defineProps<{
  drawer: boolean;
  rail: boolean;
}>();

defineEmits<{
  'update:drawer': [value: boolean];
}>();

const route = useRoute();

const items = [
  {
    label: '作战总览',
    caption: '状态、节奏、快捷入口',
    to: '/dashboard',
    icon: mdiViewDashboardOutline
  },
  {
    label: '游戏会话',
    caption: '开始、提问、结算',
    to: '/game',
    icon: mdiPlayBoxMultipleOutline
  },
  {
    label: '对局历史',
    caption: '查看过往记录',
    to: '/history',
    icon: mdiHistory
  },
  {
    label: '系统设置',
    caption: 'Ollama 与模型配置',
    to: '/settings',
    icon: mdiCogOutline
  }
];
</script>

<style scoped>
.sidebar-nav {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 255, 0.93)),
    #ffffff;
  border-right: 1px solid rgba(214, 225, 237, 0.8);
}
</style>
