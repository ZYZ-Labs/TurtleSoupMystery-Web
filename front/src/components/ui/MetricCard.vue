<template>
  <v-card class="glass-card metric-card">
    <v-card-text class="d-flex align-start justify-space-between">
      <div>
        <div class="text-body-2 text-medium-emphasis mb-2">{{ label }}</div>
        <div class="brand-heading text-h4 mb-1">{{ value }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ caption }}</div>
      </div>
      <div class="metric-card__icon" :style="{ background: tone }">
        <v-icon :icon="icon" size="26" color="white" />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  caption: string;
  icon: string;
  tone: string;
}>();
</script>

<style scoped>
.metric-card {
  height: 100%;
}

.metric-card__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  box-shadow: 0 12px 24px rgba(24, 33, 47, 0.12);
}
</style>
