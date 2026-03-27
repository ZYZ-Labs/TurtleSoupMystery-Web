<template>
  <v-card class="glass-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3 px-6 pt-6">
      <div>
        <div class="section-title">对局历史</div>
        <div class="text-body-2 text-medium-emphasis">所有问答与最终猜测都会被保留在本地持久化存储里。</div>
      </div>
      <v-btn variant="outlined" to="/game">去开新局</v-btn>
    </v-card-title>
    <v-card-text class="pt-4">
      <v-table>
        <thead>
          <tr>
            <th>谜题</th>
            <th>状态</th>
            <th>问题数</th>
            <th>进度</th>
            <th>更新时间</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="session in sessions" :key="session.sessionId">
            <td>
              <div class="font-weight-medium">{{ session.puzzleTitle }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ session.soupSurface }}</div>
            </td>
            <td>
              <v-chip size="small" :color="statusColor(session.status)">{{ statusLabel(session.status) }}</v-chip>
            </td>
            <td>{{ session.questions.length }}</td>
            <td>{{ session.progressScore }}%</td>
            <td>{{ formatDateTime(session.updatedAt) }}</td>
            <td class="text-right">
              <v-btn size="small" variant="text" :to="`/game/${session.sessionId}`">查看</v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <v-alert v-if="!sessions.length" type="info" variant="tonal" class="mt-4">
        暂时没有历史记录，先去创建第一局游戏。
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchSessions } from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { GameSession, SessionStatus } from '@/types/api';

const ui = useUiStore();
const sessions = ref<GameSession[]>([]);

function statusColor(status: SessionStatus) {
  return {
    playing: 'info',
    solved: 'success',
    failed: 'error'
  }[status];
}

function statusLabel(status: SessionStatus) {
  return {
    playing: '进行中',
    solved: '已破解',
    failed: '已结束'
  }[status];
}

async function loadSessions() {
  try {
    sessions.value = await fetchSessions();
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

onMounted(() => {
  void loadSessions();
});
</script>
