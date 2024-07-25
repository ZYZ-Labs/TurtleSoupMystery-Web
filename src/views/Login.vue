<template>
  <el-form class="main-container" :model="form" label-width="auto" style="max-width: 600px">
    <el-form-item label="昵称：">
      <el-input v-model="form.name"/>
    </el-form-item>
    <el-form-item class="operation-button-layout">
      <el-button class="operation-button" @click="router.back()">取消</el-button>
      <el-button class="operation-button" type="primary" @click="onSubmit">确定</el-button>
    </el-form-item>
  </el-form>
</template>
<script setup lang="ts">
import {onMounted, reactive} from "vue";
import {showTitle} from "../utils/ViewUtils.ts";
import {useRouter} from "vue-router";

const router = useRouter()

const form = reactive({
  name: '',
})

const onSubmit = () => {
  console.log('submit!')
  router.back()
}

onMounted(() => {
  showTitle("登录")
})
</script>
<style scoped>
.operation-button-layout {
  display: flex;
}

.operation-button {
  flex: 1;
}
</style>