<template>
  <div class="brand-mark">
    <div class="brand-mark__icon">
      <v-icon :icon="mdiBowlMix" size="26" />
    </div>
    <div>
      <div class="brand-heading brand-mark__title">Turtle Soup</div>
      <div class="brand-mark__subtitle">多人推理主持台</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mdiBowlMix } from '@mdi/js';
</script>

<style scoped>
.brand-mark {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: white;
  background: linear-gradient(135deg, #1f6feb, #0f766e);
  box-shadow: 0 12px 24px rgba(31, 111, 235, 0.28);
}

.brand-mark__title {
  font-size: 1.02rem;
  line-height: 1.1;
}

.brand-mark__subtitle {
  font-size: 0.78rem;
  color: rgba(24, 33, 47, 0.62);
}
</style>
