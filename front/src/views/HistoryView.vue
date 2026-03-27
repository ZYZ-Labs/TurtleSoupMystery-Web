<template>
  <v-card class="glass-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3 px-6 pt-6">
      <div>
        <div class="section-title">房间历史</div>
        <div class="text-body-2 text-medium-emphasis">
          所有多人房间、成员和最终结算结果都会保存在本地 SQLite 中。
        </div>
      </div>
      <v-btn variant="outlined" to="/game">去创建房间</v-btn>
    </v-card-title>
    <v-card-text class="pt-4">
      <v-table>
        <thead>
          <tr>
            <th>谜题 / 房间码</th>
            <th>状态</th>
            <th>成员</th>
            <th>消息数</th>
            <th>进度</th>
            <th>更新时间</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="room in rooms" :key="room.roomId">
            <td>
              <div class="font-weight-medium">{{ room.puzzleTitle }}</div>
              <div class="text-body-2 text-medium-emphasis">房间码 {{ room.roomCode }} · {{ room.title }}</div>
            </td>
            <td>
              <v-chip size="small" :color="statusColor(room.status)">{{ statusLabel(room.status) }}</v-chip>
            </td>
            <td>{{ room.participants.length }}</td>
            <td>{{ room.messageCount }}</td>
            <td>{{ room.progressScore }}%</td>
            <td>{{ formatDateTime(room.updatedAt) }}</td>
            <td class="text-right">
              <div class="d-inline-flex align-center ga-2 flex-wrap justify-end">
                <v-btn size="small" variant="text" :to="`/game/${room.roomCode}`">进入</v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  :loading="deletingRoomId === room.roomId"
                  @click="handleDeleteRoom(room)"
                >
                  删除
                </v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>

      <v-alert v-if="!rooms.length" type="info" variant="tonal" class="mt-4">
        还没有历史房间，先去创建第一局多人推理吧。
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { deleteRoom, fetchRooms } from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { PublicGameRoom, RoomStatus } from '@/types/api';

const ui = useUiStore();
const rooms = ref<PublicGameRoom[]>([]);
const deletingRoomId = ref('');

function statusColor(status: RoomStatus) {
  return {
    playing: 'info',
    solved: 'success',
    failed: 'error'
  }[status];
}

function statusLabel(status: RoomStatus) {
  return {
    playing: '进行中',
    solved: '已破解',
    failed: '已结束'
  }[status];
}

async function loadRooms() {
  try {
    rooms.value = await fetchRooms();
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function handleDeleteRoom(room: PublicGameRoom) {
  const confirmed = window.confirm(`确定要删除房间 ${room.roomCode} 吗？删除后无法恢复。`);

  if (!confirmed) {
    return;
  }

  deletingRoomId.value = room.roomId;

  try {
    await deleteRoom(room.roomId);
    rooms.value = rooms.value.filter((item) => item.roomId !== room.roomId);
    ui.notify('房间已删除。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    deletingRoomId.value = '';
  }
}

onMounted(() => {
  void loadRooms();
});
</script>
