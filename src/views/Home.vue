<template>
  <el-container class="home-container">
    <el-header>
      <h1 class="title">海龟汤</h1>
    </el-header>
    <el-main>
      <el-row class="button-row">
        <el-col>
          <el-button type="primary" size="large" @click="navigateTo('/auto-match')">自动匹配</el-button>
        </el-col>
        <el-col>
          <el-button type="success" size="large" @click="navigateTo('/create-room')">创建房间</el-button>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<script lang="ts">
import {defineComponent} from 'vue';
import {useRouter} from 'vue-router';

export default defineComponent({
  name: 'Home',
  setup() {
    const router = useRouter();

    const navigateTo = (path: string) => {
      router.push(path);
    };

    return {
      navigateTo
    };
  }
});
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

.button-row {
  margin-top: 30px;
  position: fixed;
  align-content: center;
}
</style>
