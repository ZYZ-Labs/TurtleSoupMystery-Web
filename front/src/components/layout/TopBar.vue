<template>
  <v-app-bar flat class="top-bar px-4">
    <template #prepend>
      <v-btn icon variant="text" @click="$emit('toggle-drawer')">
        <v-icon :icon="mdiMenu" />
      </v-btn>
    </template>

    <div>
      <div class="brand-heading text-h6">{{ title }}</div>
      <div class="text-body-2 text-medium-emphasis">Berry 风格重构后的海龟汤指挥台</div>
    </div>

    <template #append>
      <v-chip :color="statusColor" variant="flat" class="mr-2">
        {{ statusText }}
      </v-chip>
      <v-btn icon variant="text" @click="$emit('toggle-rail')">
        <v-icon :icon="mdiDockLeft" />
      </v-btn>
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
import { mdiDockLeft, mdiMenu } from '@mdi/js';

defineProps<{
  title: string;
  statusText: string;
  statusColor: string;
}>();

defineEmits<{
  'toggle-drawer': [];
  'toggle-rail': [];
}>();
</script>

<style scoped>
.top-bar {
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(214, 225, 237, 0.85);
}
</style>
