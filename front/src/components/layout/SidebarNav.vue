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
          <div class="text-subtitle-2 font-weight-bold mb-1">当前模式</div>
          <div class="text-body-2 text-medium-emphasis">
            动态出题、多人房间、轮询同步、Ollama 主持裁决。
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
    label: '总览看板',
    caption: '房间、成员与主持状态',
    to: '/dashboard',
    icon: mdiViewDashboardOutline
  },
  {
    label: '多人房间',
    caption: '创建、加入与共享推理',
    to: '/game',
    icon: mdiPlayBoxMultipleOutline
  },
  {
    label: '房间历史',
    caption: '查看过往对局记录',
    to: '/history',
    icon: mdiHistory
  },
  {
    label: '系统设置',
    caption: 'Ollama 与默认模型',
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
