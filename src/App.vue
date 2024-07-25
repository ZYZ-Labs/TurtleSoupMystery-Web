<template>
  <el-container class="root-container">
    <HeaderComponent v-if="headerStatus"/>
    <el-main class="main-content">
      <RouterView class="router-view"/>
    </el-main>
    <FooterComponent v-if="footerStatus"/>
  </el-container>
</template>

<script setup lang="ts">
import HeaderComponent from "./components/HeaderComponent.vue";
import FooterComponent from "./components/FooterComponent.vue";
import {useStore} from './store';
import {computed} from 'vue';

const store = useStore();

const headerStatus = computed(() => store.state.main.headerStatus);
const footerStatus = computed(() => store.state.main.footerStatus);
</script>

<style scoped>
.root-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.main-content {
  flex: 1;
  padding-top: 60px;
  padding-bottom: 60px;
  overflow: auto;
}

.router-view {
  height: 100%;
}
</style>
