<template>
  <v-row>
    <v-col cols="12">
      <v-card class="glass-card overflow-hidden">
        <v-card-text class="pa-6 pa-md-8 dashboard-hero">
          <div>
            <div class="text-overline mb-3">TURTLE_SOUP_SPEC / MVP</div>
            <h1 class="brand-heading text-h3 mb-3">把谜题真相锁住，把推理节奏交给 AI 主持。</h1>
            <p class="text-body-1 text-medium-emphasis mb-5 dashboard-hero__copy">
              当前版本已经重建为前后端一体的控制台架构，前台负责游戏体验，后台负责真相一致性、会话状态和
              Ollama 接入。
            </p>
            <div class="d-flex flex-wrap ga-3">
              <v-btn color="primary" size="large" to="/game">开始新局</v-btn>
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
              <span class="text-body-2 text-medium-emphasis">默认模型</span>
              <span class="text-body-2">{{ overview?.ollama.defaultModel || '未选择' }}</span>
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
        label="谜题数量"
        :value="overview?.summary.puzzleCount ?? 0"
        caption="当前内置可直接开局的谜题数"
        :icon="mdiPuzzleOutline"
        tone="linear-gradient(135deg, #1f6feb, #58a6ff)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="累计对局"
        :value="overview?.summary.sessionCount ?? 0"
        caption="历史会话都会进入持久化存档"
        :icon="mdiChartTimelineVariant"
        tone="linear-gradient(135deg, #0f766e, #22c55e)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="进行中"
        :value="overview?.summary.activeSessionCount ?? 0"
        caption="仍可继续追问与提交最终猜测"
        :icon="mdiMotionPlayOutline"
        tone="linear-gradient(135deg, #f59e0b, #fbbf24)"
      />
    </v-col>
    <v-col cols="12" md="6" xl="3">
      <MetricCard
        label="破解成功"
        :value="overview?.summary.solvedSessionCount ?? 0"
        caption="完成真相还原的会话总数"
        :icon="mdiTrophyOutline"
        tone="linear-gradient(135deg, #7c3aed, #c084fc)"
      />
    </v-col>

    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">最近对局</v-card-title>
        <v-card-text class="pt-2">
          <v-list v-if="overview?.latestSessions.length" lines="two">
            <v-list-item v-for="session in overview.latestSessions" :key="session.sessionId" :to="`/game/${session.sessionId}`">
              <template #prepend>
                <v-avatar color="rgba(31,111,235,0.12)">
                  <v-icon :icon="mdiBowlMix" color="primary" />
                </v-avatar>
              </template>
              <v-list-item-title>{{ session.puzzleTitle }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ formatDateTime(session.updatedAt) }} · {{ session.questions.length }} 个问题 · 进度 {{ session.progressScore }}%
              </v-list-item-subtitle>
              <template #append>
                <v-chip size="small" :color="session.status === 'solved' ? 'success' : session.status === 'failed' ? 'error' : 'info'">
                  {{ statusLabel(session.status) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">还没有对局记录，去“游戏会话”里开一局吧。</v-alert>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="5">
      <v-card class="glass-card h-100">
        <v-card-title class="section-title px-6 pt-6">主持规则提醒</v-card-title>
        <v-card-text class="pt-2">
          <v-list density="compact">
            <v-list-item>回答严格限制为“是 / 否 / 无关 / 部分相关 / 无法判断”。</v-list-item>
            <v-list-item>真相不因玩家问法改变，所有判定围绕谜题事实集合进行。</v-list-item>
            <v-list-item>当前架构优先保证单人模式、固定谜题和会话持久化的稳定性。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  mdiBowlMix,
  mdiChartTimelineVariant,
  mdiMotionPlayOutline,
  mdiPuzzleOutline,
  mdiTrophyOutline
} from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import { fetchOverview } from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { OverviewPayload, SessionStatus } from '@/types/api';

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

function statusLabel(status: SessionStatus) {
  return {
    playing: '进行中',
    solved: '已破解',
    failed: '已结束'
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
