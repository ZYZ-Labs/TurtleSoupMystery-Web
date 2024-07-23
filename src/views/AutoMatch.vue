<template>
  <el-container class="home-container">
    <el-main>
      <el-row class="main-container">
        <div>{{ message }}</div>
      </el-row>
    </el-main>
  </el-container>
</template>

<script lang="ts" setup>
import {onMounted, ref} from 'vue';
import {showTitle} from "../utils/ViewUtils.ts";

const message = ref('等待开始匹配...');

onMounted(() => {
  showTitle("自动匹配")
  startMatching()
})

const startMatching = () => {
  message.value = '正在匹配中...';
  // 模拟匹配过程
  setTimeout(() => {
    message.value = '匹配成功！';
  }, 2000);
};
</script>

<style scoped>
.home-container {
  text-align: center;
  padding-top: 50px;
}
</style>
