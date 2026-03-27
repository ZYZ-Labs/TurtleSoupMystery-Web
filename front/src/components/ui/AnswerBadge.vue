<template>
  <v-chip :color="color" variant="flat" size="small">
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AnswerCode } from '@/types/api';

const props = defineProps<{
  code: AnswerCode;
  label?: string;
}>();

const color = computed(() => {
  return {
    yes: 'success',
    no: 'error',
    irrelevant: 'info',
    partial: 'warning',
    unknown: 'secondary'
  }[props.code];
});

const label = computed(() => {
  return (
    props.label ??
    {
      yes: '是',
      no: '否',
      irrelevant: '无关',
      partial: '部分相关',
      unknown: '无法判断'
    }[props.code]
  );
});
</script>
