<template>
  <el-footer class="main-footer">
    <div class="footer-container">
      <div>
        <slot name="top">MIT License</slot>
      </div>
      <div>
        <slot name="bottom">Copyright (c) 2024 ZYZ-Labs</slot>
      </div>
    </div>
  </el-footer>
</template>

<script setup lang="ts">
// 无需额外的脚本逻辑
</script>

<style scoped>
.main-footer {
  position: fixed; /* 固定在视口底部 */
  bottom: 0; /* 底部对齐 */
  width: 100%; /* 占据全宽 */
  display: flex;
  justify-content: flex-end; /* 将内容置底 */
  align-items: center; /* 垂直居中 */
  flex-direction: column; /* 垂直排列 */
  color: rgba(0,0,0,0.5); /* 字体颜色 */
  font-family: Arial, sans-serif; /* 字体样式 */
  font-size: 12px; /* 字体大小 */
  background-color: white; /* 背景颜色，防止内容被遮挡 */
}


.footer-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 0.5rem;
  justify-content: flex-end; /* 将内容置底 */
}
</style>
