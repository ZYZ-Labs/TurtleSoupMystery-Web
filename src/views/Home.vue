<template>
  <el-container class="home-container">
    <el-header>
      <h1 class="title">海龟汤</h1>
    </el-header>
    <el-main>
      <el-row class="button-container">
        <el-col>
          <el-button class="button-item" type="primary" size="large" @click="navigateTo('/auto-match')">自动匹配
          </el-button>
        </el-col>
        <el-col>
          <el-button class="button-item" type="success" size="large" @click="navigateTo('/create-room')">创建房间
          </el-button>
        </el-col>
        <el-col>
          <div class="text-item" @click="navigateTo('/login')">登录</div>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<script lang="ts" setup>
import {useRouter} from 'vue-router';
import {onMounted} from "vue";
import {hideTitle} from "../utils/ViewUtils.ts";

const router = useRouter();
const navigateTo = (path: string) => {
  router.push(path);
}

onMounted(() => {
  hideTitle()
})
</script>

<style scoped>
.home-container {
  text-align: center;
  padding-top: 50px;
}

.title {
  font-size: 36px;
  margin-bottom: 40px;
  text-align: center;
}

.button-container {
  margin-top: 30px;
  align-content: center;
}

.button-item {
  margin: 10px 0;
  width: 200px;
}

.text-item {
  margin-top: 10px;
  color: dodgerblue;
}
</style>
