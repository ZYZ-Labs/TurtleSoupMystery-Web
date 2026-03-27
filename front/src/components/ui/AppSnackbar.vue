<template>
  <v-snackbar :model-value="ui.open" @update:model-value="handleUpdate" :color="ui.color" location="top right">
    {{ ui.message }}
    <template #actions>
      <v-btn variant="text" @click="ui.close()">关闭</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();

function handleUpdate(value: boolean) {
  if (!value) {
    ui.close();
  }
}
</script>
