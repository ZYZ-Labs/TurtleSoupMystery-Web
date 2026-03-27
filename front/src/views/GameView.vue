<template>
  <v-row v-if="!session">
    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">开始一局新推理</v-card-title>
        <v-card-text class="pt-4">
          <v-alert v-if="!ollamaConfigured" type="warning" variant="tonal" class="mb-4">
            还没有完成 Ollama 配置。你依然可以先创建对局，但真正的 AI 主持效果要在“系统设置”里连通模型后才能完整发挥。
          </v-alert>

          <v-select
            v-model="selectedPuzzleId"
            :items="puzzleItems"
            item-title="title"
            item-value="value"
            label="选择谜题"
            class="mb-4"
          />

          <v-sheet rounded="xl" color="rgba(31,111,235,0.05)" class="pa-5 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">{{ selectedPuzzle?.title || '暂无谜题' }}</div>
            <p class="text-body-1 mb-4">{{ selectedPuzzle?.soupSurface }}</p>
            <div class="d-flex flex-wrap ga-2">
              <v-chip size="small" color="primary" variant="tonal">{{ difficultyLabel }}</v-chip>
              <v-chip v-for="tag in selectedPuzzle?.tags ?? []" :key="tag" size="small" variant="outlined">
                {{ tag }}
              </v-chip>
            </div>
          </v-sheet>

          <v-btn color="primary" size="large" :loading="creating" @click="handleStartSession">
            创建并进入本局
          </v-btn>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="5">
      <v-card class="glass-card h-100">
        <v-card-title class="section-title px-6 pt-6">玩法边界</v-card-title>
        <v-card-text class="pt-4">
          <v-list density="comfortable">
            <v-list-item>玩家通过问句逼近真相，主持回答只允许标准五类结果。</v-list-item>
            <v-list-item>当前版本优先保证真相一致性，不让模型临场改设定。</v-list-item>
            <v-list-item>最终猜测会进入结算，失败后也会公开完整汤底。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-row v-else>
    <v-col cols="12" lg="5">
      <v-card class="glass-card mb-4">
        <v-card-title class="d-flex align-center justify-space-between px-6 pt-6">
          <div class="section-title">{{ session.puzzleTitle }}</div>
          <v-chip :color="statusColor(session.status)" variant="flat">{{ statusLabel(session.status) }}</v-chip>
        </v-card-title>
        <v-card-text class="pt-4">
          <div class="text-overline mb-2">汤面</div>
          <p class="text-body-1 mb-5">{{ session.soupSurface }}</p>

          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-body-2 text-medium-emphasis">推理进度</span>
            <span class="font-weight-medium">{{ session.progressScore }}%</span>
          </div>
          <v-progress-linear :model-value="session.progressScore" color="primary" rounded class="mb-5" />

          <div class="d-flex flex-wrap ga-2 mb-5">
            <v-chip size="small" color="primary" variant="tonal">{{ formatDifficulty(session.difficulty) }}</v-chip>
            <v-chip size="small" variant="outlined">{{ session.questions.length }} 个问题</v-chip>
            <v-chip size="small" variant="outlined">{{ session.revealedFacts.length }} 条已揭示事实</v-chip>
          </div>

          <div class="text-subtitle-2 font-weight-bold mb-2">已揭示事实</div>
          <v-list v-if="session.revealedFacts.length" density="comfortable" class="mb-2">
            <v-list-item v-for="fact in session.revealedFacts" :key="fact.factId">
              <template #prepend>
                <v-icon :icon="mdiCheckCircleOutline" color="success" />
              </template>
              <v-list-item-title>{{ fact.statement }}</v-list-item-title>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">还没有揭示出的事实，先从高质量提问开始。</v-alert>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">
          {{ session.status === 'playing' ? '最终猜测' : '本局结算' }}
        </v-card-title>
        <v-card-text class="pt-4">
          <template v-if="session.status === 'playing'">
            <p class="text-body-2 text-medium-emphasis mb-4">
              当你认为自己已经还原出完整故事时，可以提交最终猜测进行结算。
            </p>
            <div class="d-flex flex-wrap ga-3">
              <v-btn color="primary" @click="guessDialog = true">提交最终猜测</v-btn>
              <v-btn variant="outlined" color="error" @click="handleReveal">结束并公开汤底</v-btn>
            </div>
          </template>

          <template v-else>
            <v-alert :type="session.status === 'solved' ? 'success' : 'warning'" variant="tonal" class="mb-4">
              {{ session.status === 'solved' ? '本局已破解。' : '本局已结束，以下为完整汤底。' }}
            </v-alert>
            <div class="text-subtitle-2 font-weight-bold mb-2">完整汤底</div>
            <p class="text-body-1 mb-4">{{ session.truthStory }}</p>
            <div v-if="session.finalGuess" class="text-body-2 text-medium-emphasis">
              最终猜测评分：{{ session.finalGuess.score }}%
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="7">
      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">问题记录</v-card-title>
        <v-card-text class="pt-4">
          <div v-if="session.questions.length" class="question-log">
            <div v-for="item in session.questions" :key="item.id" class="question-log__item">
              <div class="d-flex align-start justify-space-between ga-4 flex-wrap mb-2">
                <div class="font-weight-medium">{{ item.question }}</div>
                <AnswerBadge :code="item.answerCode" :label="item.answerLabel" />
              </div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                {{ formatDateTime(item.createdAt) }} · 命中 {{ item.matchedFactCount }} 条事实 · 推进 {{ item.progressDelta }}%
              </div>
              <div v-if="item.revealedFacts.length" class="d-flex flex-wrap ga-2 mt-2">
                <v-chip
                  v-for="fact in item.revealedFacts"
                  :key="fact.factId"
                  size="x-small"
                  color="secondary"
                  variant="tonal"
                >
                  揭示 {{ fact.statement }}
                </v-chip>
              </div>
            </div>
          </div>
          <v-alert v-else type="info" variant="tonal">本局还没有任何提问，先抛出一个 Yes / No 风格的问题。</v-alert>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">继续提问</v-card-title>
        <v-card-text class="pt-4">
          <v-textarea
            v-model="question"
            rows="4"
            auto-grow
            label="输入你的问题"
            placeholder="例如：这件事和海难有关吗？"
            :disabled="session.status !== 'playing'"
          />
          <div class="d-flex justify-space-between align-center flex-wrap ga-3">
            <div class="text-body-2 text-medium-emphasis">
              目标是让主持人只给出结构化回答，而不是主动剧透。
            </div>
            <v-btn color="primary" :loading="asking" :disabled="session.status !== 'playing'" @click="handleAskQuestion">
              提交问题
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-dialog v-model="guessDialog" max-width="720">
    <v-card>
      <v-card-title class="section-title px-6 pt-6">提交最终猜测</v-card-title>
      <v-card-text class="pt-4">
        <v-textarea
          v-model="finalGuess"
          rows="6"
          auto-grow
          label="完整描述你还原出的故事"
          placeholder="请尽量交代关键人物、事件顺序、动机与触发原因。"
        />
      </v-card-text>
      <v-card-actions class="px-6 pb-6">
        <v-spacer />
        <v-btn variant="text" @click="guessDialog = false">取消</v-btn>
        <v-btn color="primary" :loading="guessing" @click="handleSubmitGuess">确认结算</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { mdiCheckCircleOutline } from '@mdi/js';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AnswerBadge from '@/components/ui/AnswerBadge.vue';
import {
  askQuestion,
  createSession,
  fetchOllamaConfig,
  fetchPuzzles,
  fetchSession,
  revealSession,
  submitFinalGuess
} from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime, formatDifficulty } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { GameSession, Puzzle, SessionStatus } from '@/types/api';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();

const puzzles = ref<Puzzle[]>([]);
const session = ref<GameSession | null>(null);
const selectedPuzzleId = ref('');
const question = ref('');
const finalGuess = ref('');
const ollamaConfigured = ref(false);

const creating = ref(false);
const asking = ref(false);
const guessing = ref(false);
const guessDialog = ref(false);

const selectedPuzzle = computed(() => {
  const id = session.value?.puzzleId ?? selectedPuzzleId.value;
  return puzzles.value.find((item) => item.puzzleId === id) ?? null;
});

const puzzleItems = computed(() =>
  puzzles.value.map((item) => ({
    title: `${item.title} · ${formatDifficulty(item.difficulty)}`,
    value: item.puzzleId
  }))
);

const difficultyLabel = computed(() =>
  selectedPuzzle.value ? `${formatDifficulty(selectedPuzzle.value.difficulty)} 难度` : '未选择'
);

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

async function loadPuzzlesAndConfig() {
  try {
    const [puzzleList, config] = await Promise.all([fetchPuzzles(), fetchOllamaConfig()]);
    puzzles.value = puzzleList;
    ollamaConfigured.value = Boolean(config.baseUrl && config.defaultModel);

    if (!selectedPuzzleId.value && puzzleList.length) {
      selectedPuzzleId.value = puzzleList[0].puzzleId;
    }
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function loadSessionFromRoute() {
  const sessionId = typeof route.params.sessionId === 'string' ? route.params.sessionId : '';

  if (!sessionId) {
    session.value = null;
    return;
  }

  try {
    session.value = await fetchSession(sessionId);
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function handleStartSession() {
  if (!selectedPuzzleId.value) {
    ui.notify('请先选择一个谜题。', 'warning');
    return;
  }

  creating.value = true;

  try {
    const created = await createSession(selectedPuzzleId.value);
    session.value = created;
    ui.notify('新对局已创建。', 'success');
    await router.push(`/game/${created.sessionId}`);
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    creating.value = false;
  }
}

async function handleAskQuestion() {
  if (!session.value) {
    return;
  }

  if (!question.value.trim()) {
    ui.notify('请输入问题。', 'warning');
    return;
  }

  asking.value = true;

  try {
    session.value = await askQuestion(session.value.sessionId, question.value.trim());
    question.value = '';
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    asking.value = false;
  }
}

async function handleSubmitGuess() {
  if (!session.value) {
    return;
  }

  if (!finalGuess.value.trim()) {
    ui.notify('请先填写最终猜测。', 'warning');
    return;
  }

  guessing.value = true;

  try {
    session.value = await submitFinalGuess(session.value.sessionId, finalGuess.value.trim());
    guessDialog.value = false;
    finalGuess.value = '';
    ui.notify(session.value.status === 'solved' ? '恭喜，你破解了本局。' : '结算完成，已公开汤底。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    guessing.value = false;
  }
}

async function handleReveal() {
  if (!session.value) {
    return;
  }

  try {
    session.value = await revealSession(session.value.sessionId);
    ui.notify('本局已结束，汤底已公开。', 'warning');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

watch(
  () => route.params.sessionId,
  () => {
    void loadSessionFromRoute();
  }
);

onMounted(() => {
  void loadPuzzlesAndConfig();
  void loadSessionFromRoute();
});
</script>

<style scoped>
.question-log {
  display: grid;
  gap: 16px;
}

.question-log__item {
  padding: 16px;
  border-radius: 20px;
  background: rgba(244, 248, 253, 0.9);
  border: 1px solid rgba(214, 225, 237, 0.8);
}
</style>
