<template>
  <v-row>
    <v-col cols="12">
      <v-card class="glass-card overflow-hidden">
        <v-card-text class="pa-6 pa-md-8 dashboard-hero">
          <div>
            <div class="text-overline mb-3">MULTIPLAYER / DYNAMIC PUZZLE</div>
            <h1 class="brand-heading text-h3 mb-3">把汤底实时生成，把推理过程交给多人房间协作。</h1>
            <p class="text-body-1 text-medium-emphasis mb-5 dashboard-hero__copy">
              当前版本已经切到多人聊天室模式。房主创建主题后由 Ollama 生成汤底，成员加入同一房间共享提问记录、主持回答和揭示进度。
            </p>
            <div class="d-flex flex-wrap ga-3">
              <v-btn color="primary" size="large" to="/game">创建房间</v-btn>
              <v-btn variant="outlined" size="large" to="/settings">检查 Ollama</v-btn>
            </div>
          </div>
          <v-sheet rounded="xl" class="dashboard-hero__status pa-4 pa-md-5">
            <div class="text-subtitle-1 font-weight-bold mb-4">系统快照</div>
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-body-2 text-medium-emphasis">模型连接</span>
              <v-chip :color="ollamaColor" variant="flat">{{ ollamaLabel }}</v-chip>
            </div>
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-body-2 text-medium-emphasis">生成侧</span>
              <span class="text-body-2">
                {{ overview?.ollama.generationSupplierLabel ? `${overview.ollama.generationSupplierLabel} / ${overview.ollama.generationModel}` : '未选择' }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-body-2 text-medium-emphasis">校验侧</span>
              <span class="text-body-2">
                {{ overview?.ollama.validationSupplierLabel ? `${overview.ollama.validationSupplierLabel} / ${overview.ollama.validationModel}` : '未选择' }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">最近检测</span>
              <span class="text-body-2">{{ formatDateTime(overview?.ollama.lastCheckedAt) }}</span>
            </div>
          </v-sheet>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="房间总数"
        :value="overview?.summary.roomCount ?? 0"
        caption="所有创建过的协作推理房间"
        :icon="mdiPlayBoxMultipleOutline"
        tone="linear-gradient(135deg, #1f6feb, #58a6ff)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="进行中"
        :value="overview?.summary.activeRoomCount ?? 0"
        caption="仍可继续提问与协作推理"
        :icon="mdiMotionPlayOutline"
        tone="linear-gradient(135deg, #0f766e, #22c55e)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="在线成员"
        :value="overview?.summary.onlineParticipantCount ?? 0"
        caption="最近 60 秒内仍有心跳的参与者"
        :icon="mdiAccountGroupOutline"
        tone="linear-gradient(135deg, #f59e0b, #fbbf24)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="已破解"
        :value="overview?.summary.solvedRoomCount ?? 0"
        caption="最终猜测命中的房间数"
        :icon="mdiTrophyOutline"
        tone="linear-gradient(135deg, #7c3aed, #c084fc)"
      />
    </v-col>

    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">最近房间</v-card-title>
        <v-card-text class="pt-2">
          <v-list v-if="overview?.latestRooms.length" lines="two">
            <v-list-item v-for="room in overview.latestRooms" :key="room.roomId" :to="`/game/${room.roomCode}`">
              <template #prepend>
                <v-avatar color="rgba(31,111,235,0.12)">
                  <v-icon :icon="mdiBowlMix" color="primary" />
                </v-avatar>
              </template>
              <v-list-item-title>{{ room.puzzleTitle }}</v-list-item-title>
              <v-list-item-subtitle>
                房间码 {{ room.roomCode }} · {{ formatDateTime(room.updatedAt) }} · {{ room.participants.length }} 人 · 进度
                {{ room.progressScore }}%
              </v-list-item-subtitle>
              <template #append>
                <v-chip size="small" :color="statusColor(room.status)">
                  {{ statusLabel(room.status) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">还没有房间记录，先去创建一局新的多人汤面吧。</v-alert>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="5">
      <v-card class="glass-card h-100">
        <v-card-title class="section-title px-6 pt-6">主持规则提醒</v-card-title>
        <v-card-text class="pt-2">
          <v-list density="compact">
            <v-list-item>回答严格限制为“是 / 否 / 无关 / 部分相关 / 无法判断”。</v-list-item>
            <v-list-item>动态汤底生成后不会在游戏中途改写，所有裁决都围绕已生成事实进行。</v-list-item>
            <v-list-item>当前版本采用轮询同步，适合局域网或轻量多人协作场景。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiBowlMix,
  mdiMotionPlayOutline,
  mdiPlayBoxMultipleOutline,
  mdiTrophyOutline
} from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import { fetchOverview } from '@/api/services';
import MetricCard from '@/components/ui/MetricCard.vue';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { OverviewPayload, RoomStatus } from '@/types/api';

const ui = useUiStore();
const overview = ref<OverviewPayload | null>(null);

const ollamaLabel = computed(() => {
  const status = overview.value?.ollama.lastStatus ?? 'idle';
  return {
    idle: '未检测',
    connected: '已连接',
    error: '连接异常'
  }[status];
});

const ollamaColor = computed(() => {
  const status = overview.value?.ollama.lastStatus ?? 'idle';
  return {
    idle: 'warning',
    connected: 'success',
    error: 'error'
  }[status];
});

function statusLabel(status: RoomStatus) {
  return {
    playing: '进行中',
    solved: '已破解',
    failed: '已结束'
  }[status];
}

function statusColor(status: RoomStatus) {
  return {
    playing: 'info',
    solved: 'success',
    failed: 'error'
  }[status];
}

async function loadOverview() {
  try {
    overview.value = await fetchOverview();
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

onMounted(() => {
  void loadOverview();
});
</script>

<style scoped>
.dashboard-hero {
  display: grid;
  gap: 24px;
}

.dashboard-hero__copy {
  max-width: 760px;
}

.dashboard-hero__status {
  width: 100%;
  max-width: 340px;
  border: 1px solid rgba(214, 225, 237, 0.85);
  background: rgba(255, 255, 255, 0.74);
}

@media (min-width: 960px) {
  .dashboard-hero {
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 340px);
    align-items: center;
  }
}
</style>
