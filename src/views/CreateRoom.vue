<template>
  <div class="main-container">
    <!-- 创建房间的内容 -->
    <el-col>
      <el-space :size="10" direction="vertical" class="judge-member-item">
        <el-avatar shape="circle" fit="cover" :icon="UserFilled"/>
        法官
      </el-space>
      <el-row class="user-member-container">
        <el-space v-for="item in userMember" direction="vertical" class="user-member-item">
          <el-avatar shape="circle" fit="cover" :src="item.avatar"/>
          {{ item.name }}
        </el-space>
        <el-space direction="vertical" class="user-member-item"
                  @click="invite()">
          <el-avatar shape="circle" fit="cover" :src="addSvg"/>
          邀请
        </el-space>
      </el-row>
    </el-col>
  </div>
</template>

<script lang="ts" setup>
import {onMounted, Ref, ref} from "vue";
import {showTitle} from "../utils/ViewUtils.ts";
import {UserFilled} from "@element-plus/icons-vue";
import {RoomUser} from "../types/RoomUser.ts";
import addSvg from "../assets/add.svg"
import {delay} from "../utils/DateUtils.ts";

const userMember: Ref<RoomUser[]> = ref([])

onMounted(() => {
  showTitle("创建房间")
  delay(1000).then(() => {
    addUser()
  })
})

function addUser() {
  userMember.value.push(new RoomUser(`${userMember.value.length - 1}`, `${userMember.value.length}`, "https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png"))
  if (userMember.value.length < 9) {
    delay(200).then(() => {
      addUser()
    })
  }
}

function invite() {
  console.log("发起邀请")
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
</style>
