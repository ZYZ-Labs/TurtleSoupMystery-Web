<template>
  <div class="main-container">
    <!-- 创建房间的内容 -->
    <el-col>
      <el-row class="user-member-container">
        <el-space v-for="item in userMember" direction="vertical" class="user-member-item">
          <el-avatar shape="circle" fit="cover" :src="item.avatar"/>
          {{ item.name }}
        </el-space>
      </el-row>
      <div class="match-status">
        {{ message }}
      </div>
    </el-col>
  </div>
</template>

<script lang="ts" setup>
import {onMounted, Ref, ref} from 'vue';
import {showTitle} from "../utils/ViewUtils.ts";
import {RoomUser} from "../types/RoomUser.ts";
import {delay} from "../utils/DateUtils.ts";

const message = ref('等待开始匹配...');

const userMember: Ref<RoomUser[]> = ref([])

onMounted(() => {
  showTitle("自动匹配")
  startMatching()
})

const startMatching = () => {
  message.value = '正在匹配中...';
  // 模拟匹配过程
  addUser()
};

function addUser() {
  userMember.value.push(new RoomUser(`${userMember.value.length - 1}`, `${userMember.value.length}`, "https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png"))
  if (userMember.value.length < 10) {
    delay(200).then(() => {
      addUser()
    })
  } else {
    message.value = '匹配成功！';
  }
}
</script>

<style scoped>
.judge-member-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.user-member-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px;
}

.user-member-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  width: 100%;
}

.match-status {
  display: flex;
  width: 100%;
  justify-content: center;
  margin-top: 10px;
  align-items: center;
}
</style>
