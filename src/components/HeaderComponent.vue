<template>
  <el-header class="main-header">
    <el-icon class="icon-item">
      <Back @click="back"/>
    </el-icon>
    <div class="header-title">{{ title }}</div>
    <el-icon class="icon-item"/>
  </el-header>
</template>
<script setup lang="ts">
import {Back} from "@element-plus/icons-vue";
import {useStore} from "../store";
import {computed} from "vue";
import {useRouter} from "vue-router";

const router = useRouter();
const store = useStore();
const title = computed(() => store.state.main.headerTitle);

function back() {
  router.back()
}
</script>
<style scoped>
.main-header {
  position: fixed;
  top: 0;
  width: 100%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between; /* 使图标和标题两端对齐 */
  margin: 0;
  padding: 0;
}

.icon-item {
  padding: 1rem;
}

.header-title {
  flex: 1;
  text-align: center;
}
</style>