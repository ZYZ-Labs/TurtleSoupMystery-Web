<template>
  <v-row v-if="!currentRoomCode">
    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">创建多人房间</v-card-title>
        <v-card-text class="pt-4">
          <v-alert v-if="!ollamaConfigured" type="warning" variant="tonal" class="mb-4">
            当前还没有连通 Ollama。你仍然可以创建房间，系统会先使用内置的动态模板兜底出题。
          </v-alert>

          <v-text-field v-model="createForm.displayName" label="你的昵称" class="mb-4" />

          <v-select
            v-model="createForm.difficulty"
            :items="difficultyItems"
            item-title="title"
            item-value="value"
            label="难度"
            class="mb-4"
          />

          <v-textarea
            v-model="createForm.generationPrompt"
            rows="5"
            auto-grow
            label="汤底主题"
            placeholder="留空即可随机，也可以手动写：例如现代都市、误导性强、围绕一张照片展开。"
            hint="如果你懒得想主题，直接留空，系统会按难度随机挑一个方向。"
            persistent-hint
            class="mb-4"
          />

          <div class="d-flex flex-wrap ga-3">
            <v-btn color="primary" size="large" :loading="creating" :disabled="creating" @click="handleCreateRoom">
              {{ creating ? '正在构建房间...' : '创建并进入房间' }}
            </v-btn>
          </div>

          <v-alert v-if="creating" type="info" variant="tonal" class="mt-4">
            <div class="font-weight-medium mb-2">{{ creatingStatus }}</div>
            <v-progress-linear indeterminate color="primary" rounded />
          </v-alert>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="5">
      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">加入已有房间</v-card-title>
        <v-card-text class="pt-4">
          <v-text-field v-model="joinForm.roomCode" label="房间码" class="mb-4" />
          <v-text-field v-model="joinForm.displayName" label="你的昵称" class="mb-4" />
          <v-btn color="secondary" size="large" :loading="joining" @click="handleJoinRoom">加入房间</v-btn>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">玩法说明</v-card-title>
        <v-card-text class="pt-4">
          <v-list density="comfortable">
            <v-list-item>你现在只要选难度就能开局，主题留空时会自动随机。</v-list-item>
            <v-list-item>同一房间里的所有成员共享问题记录、主持回答、已揭示事实和最终结算结果。</v-list-item>
            <v-list-item>当前版本采用轮询同步，不需要额外消息中间件就能在局域网里多人协作。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-row v-else-if="loadingRoom && !room">
    <v-col cols="12">
      <v-card class="glass-card">
        <v-card-text class="d-flex align-center justify-center py-16">
          <v-progress-circular indeterminate color="primary" />
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-row v-else-if="room">
    <v-col cols="12" lg="4">
      <v-card class="glass-card mb-4">
        <v-card-title class="d-flex align-center justify-space-between px-6 pt-6">
          <div class="section-title">{{ room.puzzleTitle }}</div>
          <v-chip :color="statusColor(room.status)" variant="flat">{{ statusLabel(room.status) }}</v-chip>
        </v-card-title>
        <v-card-text class="pt-4">
          <div class="text-body-2 text-medium-emphasis mb-2">房间码</div>
          <div class="d-flex align-center ga-2 mb-4">
            <span class="font-weight-bold text-h6">{{ room.roomCode }}</span>
            <v-btn size="small" variant="text" @click="copyRoomCode">
              <v-icon :icon="mdiContentCopy" start />
              复制
            </v-btn>
          </div>

          <div class="text-body-2 text-medium-emphasis mb-2">汤面</div>
          <p class="text-body-1 mb-4">{{ room.soupSurface }}</p>

          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-body-2 text-medium-emphasis">推理进度</span>
            <span class="font-weight-medium">{{ room.progressScore }}%</span>
          </div>
          <v-progress-linear :model-value="room.progressScore" color="primary" rounded class="mb-4" />

          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-chip size="small" color="primary" variant="tonal">{{ formatDifficulty(room.difficulty) }}</v-chip>
            <v-chip size="small" variant="outlined">{{ room.participants.length }} 人</v-chip>
            <v-chip size="small" variant="outlined">{{ room.questionCount }} 次提问</v-chip>
          </div>

          <div class="text-body-2 text-medium-emphasis mb-2">生成提示</div>
          <p class="text-body-2 mb-0">{{ room.generationPrompt }}</p>

          <div v-if="canManageRoom" class="mt-4">
            <v-btn
              block
              variant="outlined"
              color="error"
              :loading="deletingRoom"
              @click="handleDeleteCurrentRoom"
            >
              删除当前房间
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">房间成员</v-card-title>
        <v-card-text class="pt-4">
          <v-list density="compact">
            <v-list-item v-for="participant in room.participants" :key="participant.participantId">
              <template #prepend>
                <v-icon :icon="participant.role === 'host' ? mdiCrownOutline : mdiAccountOutline" />
              </template>
              <v-list-item-title>
                {{ participant.displayName }}
                <v-chip v-if="activeParticipant?.participantId === participant.participantId" size="x-small" class="ml-2">
                  你
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ participant.role === 'host' ? '房主' : '玩家' }} · 最后活跃 {{ formatDateTime(participant.lastSeenAt) }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <v-card v-if="!isJoined" class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">加入当前房间</v-card-title>
        <v-card-text class="pt-4">
          <v-text-field v-model="joinForm.displayName" label="你的昵称" class="mb-4" />
          <v-btn color="secondary" :loading="joining" @click="handleJoinRoom">加入并开始协作</v-btn>
        </v-card-text>
      </v-card>

      <v-card v-else class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">当前身份</v-card-title>
        <v-card-text class="pt-4">
          <div class="text-body-1 font-weight-medium mb-2">{{ activeParticipant?.displayName }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ activeParticipant?.role === 'host' ? '房主' : '玩家' }} · 你当前已经加入此房间。
          </div>
        </v-card-text>
      </v-card>

      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">已揭示事实</v-card-title>
        <v-card-text class="pt-4">
          <v-list v-if="room.revealedFacts.length" density="compact">
            <v-list-item v-for="fact in room.revealedFacts" :key="fact.factId">
              <template #prepend>
                <v-icon :icon="mdiCheckCircleOutline" color="success" />
              </template>
              <v-list-item-title>{{ fact.statement }}</v-list-item-title>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">还没有揭示事实，先从高质量的 Yes / No 问题开始。</v-alert>
        </v-card-text>
      </v-card>

      <v-card v-if="room.status !== 'playing'" class="glass-card">
        <v-card-title class="section-title px-6 pt-6">完整汤底</v-card-title>
        <v-card-text class="pt-4">
          <p class="text-body-1 mb-4">{{ room.truthStory }}</p>
          <div v-if="room.finalGuess" class="text-body-2 text-medium-emphasis">
            最终猜测人：{{ room.finalGuess.participantName }} · 得分 {{ room.finalGuess.score }}%
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="8">
      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">聊天室</v-card-title>
        <v-card-text class="pt-4">
          <div class="message-stream">
            <div v-for="message in room.messages" :key="message.id" class="message-item" :class="`message-item--${message.type}`">
              <div class="d-flex align-center justify-space-between ga-3 flex-wrap mb-2">
                <div class="d-flex align-center ga-2">
                  <v-icon
                    :icon="
                      message.type === 'answer'
                        ? mdiMessageQuestionOutline
                        : message.type === 'status'
                          ? mdiCompassOutline
                          : mdiAccountOutline
                    "
                    size="18"
                  />
                  <span class="font-weight-medium">{{ message.authorName }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <AnswerBadge v-if="message.answerCode" :code="message.answerCode" :label="message.answerLabel" />
                  <span class="text-body-2 text-medium-emphasis">{{ formatDateTime(message.createdAt) }}</span>
                </div>
              </div>
              <div class="text-body-1">{{ message.content }}</div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">继续推进</v-card-title>
        <v-card-text class="pt-4">
          <v-alert v-if="!isJoined" type="warning" variant="tonal" class="mb-4">
            你还没有加入这个房间，加入后才能参与提问和提交最终猜测。
          </v-alert>

          <template v-if="room.status === 'playing'">
            <v-textarea
              v-model="question"
              rows="4"
              auto-grow
              label="提出一个共享问题"
              placeholder="例如：这件事和受害者主动做出的选择有关吗？"
              :disabled="!isJoined || asking"
              class="mb-4"
            />

            <v-alert v-if="asking" type="info" variant="tonal" class="mb-4">
              <div class="font-weight-medium mb-2">{{ askingStatus }}</div>
              <div class="text-body-2 text-medium-emphasis mb-3">
                正在校验问题并整理最终裁决，结果会在完成后一次性返回到聊天室。
              </div>
              <v-progress-linear indeterminate color="primary" rounded />
            </v-alert>

            <div class="d-flex flex-wrap ga-3 mb-2">
              <v-btn color="primary" :loading="asking" :disabled="!isJoined || asking" @click="handleAskQuestion">
                {{ asking ? '校验中...' : '发送问题' }}
              </v-btn>
              <v-btn variant="outlined" color="secondary" :disabled="!isJoined || asking" @click="guessDialog = true">
                提交最终猜测
              </v-btn>
              <v-btn v-if="isHost" variant="outlined" color="error" :loading="revealing" :disabled="asking" @click="handleReveal">
                公开汤底并结束
              </v-btn>
            </div>

            <div class="text-body-2 text-medium-emphasis">
              这是共享聊天室，所有成员都能看到你的提问与主持回答。
            </div>
          </template>

          <template v-else>
            <v-alert :type="room.status === 'solved' ? 'success' : 'warning'" variant="tonal">
              {{ room.status === 'solved' ? '本房间已经破解。' : '本房间已经结束。' }}
            </v-alert>
          </template>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-row v-else>
    <v-col cols="12">
      <v-card class="glass-card">
        <v-card-text class="py-10 text-center">
          <div class="text-h6 mb-3">没有找到对应房间</div>
          <v-btn color="primary" to="/game">返回大厅</v-btn>
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
          label="完整描述你的还原"
          placeholder="尽量交代关键人物、事件顺序、动机和真正触发点。"
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
import {
  mdiAccountOutline,
  mdiCheckCircleOutline,
  mdiCompassOutline,
  mdiContentCopy,
  mdiCrownOutline,
  mdiMessageQuestionOutline
} from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buildRealtimeRoomUrl } from '@/api/client';
import AnswerBadge from '@/components/ui/AnswerBadge.vue';
import {
  askRoomQuestion,
  createRoom,
  deleteRoom,
  fetchOverview,
  fetchRoomByCode,
  heartbeatRoom,
  joinRoom,
  revealRoom,
  submitRoomFinalGuess
} from '@/api/services';
import { getBrowserClientId, getStoredDisplayName, saveStoredDisplayName } from '@/lib/browserIdentity';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime, formatDifficulty } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type {
  Difficulty,
  PublicGameRoom,
  PublicRoomParticipant,
  RoomRealtimeEvent,
  RoomStatus
} from '@/types/api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const browserClientId = getBrowserClientId();
const rememberedDisplayName = getStoredDisplayName();

const room = ref<PublicGameRoom | null>(null);
const activeParticipant = ref<PublicRoomParticipant | null>(null);
const loadingRoom = ref(false);
const creating = ref(false);
const joining = ref(false);
const asking = ref(false);
const guessing = ref(false);
const revealing = ref(false);
const deletingRoom = ref(false);
const guessDialog = ref(false);
const question = ref('');
const finalGuess = ref('');
const ollamaConfigured = ref(false);
const creatingStatus = ref('');
const askingStatus = ref('');

const createForm = reactive<{
  displayName: string;
  difficulty: Difficulty;
  generationPrompt: string;
}>({
  displayName: rememberedDisplayName,
  difficulty: 'medium',
  generationPrompt: ''
});

const joinForm = reactive({
  roomCode: '',
  displayName: rememberedDisplayName
});

let heartbeatTimer: number | null = null;
let creatingStatusTimer: number | null = null;
let askingStatusTimer: number | null = null;
let realtimeReconnectTimer: number | null = null;
let realtimeSocket: WebSocket | null = null;
let realtimeShouldReconnect = false;

const creatingStatusSteps = ['正在生成汤面...', '正在编织汤底逻辑...', '正在检测汤底可推理性...', '正在整理房间信息...'];
const askingStatusSteps = ['主持正在理解问题...', '正在比对已知事实...', '正在校验回答边界...', '正在整理最终裁决...'];

const difficultyItems = [
  { title: '简单', value: 'easy' },
  { title: '中等', value: 'medium' },
  { title: '困难', value: 'hard' }
];

const currentRoomCode = computed(() => {
  const value = route.params.roomCode;
  return typeof value === 'string' ? value.toUpperCase() : '';
});

const isJoined = computed(() => {
  if (!room.value || !activeParticipant.value) {
    return false;
  }

  return room.value.participants.some((participant) => participant.participantId === activeParticipant.value?.participantId);
});

const isHost = computed(() => activeParticipant.value?.role === 'host');
const canManageRoom = computed(() => auth.isAuthenticated);

function identityStorageKey(roomCode: string) {
  return `turtle-soup-room:${roomCode}`;
}

function readStoredIdentity(roomCode: string) {
  try {
    const raw = localStorage.getItem(identityStorageKey(roomCode));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PublicRoomParticipant;
  } catch {
    return null;
  }
}

function saveStoredIdentity(roomCode: string, participant: PublicRoomParticipant) {
  localStorage.setItem(identityStorageKey(roomCode), JSON.stringify(participant));
}

function clearStoredIdentity(roomCode: string) {
  localStorage.removeItem(identityStorageKey(roomCode));
}

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

async function loadConfig() {
  try {
    const overview = await fetchOverview();
    ollamaConfigured.value = overview.ollama.configured;
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

function syncIdentityWithRoom(nextRoom: PublicGameRoom) {
  const storedIdentity = readStoredIdentity(nextRoom.roomCode);

  if (!storedIdentity) {
    activeParticipant.value = null;
    return;
  }

  const matched = nextRoom.participants.find((participant) => participant.participantId === storedIdentity.participantId);

  if (!matched) {
    clearStoredIdentity(nextRoom.roomCode);
    activeParticipant.value = null;
    return;
  }

  activeParticipant.value = matched;
  joinForm.displayName = matched.displayName;
  createForm.displayName = matched.displayName;
  saveStoredDisplayName(matched.displayName);
}

async function loadRoom(showError = true) {
  if (!currentRoomCode.value) {
    room.value = null;
    activeParticipant.value = null;
    return;
  }

  if (!room.value) {
    loadingRoom.value = true;
  }

  try {
    const nextRoom = await fetchRoomByCode(currentRoomCode.value);
    room.value = nextRoom;
    joinForm.roomCode = nextRoom.roomCode;
    syncIdentityWithRoom(nextRoom);
  } catch (error) {
    room.value = null;
    activeParticipant.value = null;
    if (showError) {
      ui.notify(extractErrorMessage(error), 'error');
    }
  } finally {
    loadingRoom.value = false;
  }
}

function stopSyncTimers() {
  stopRealtimeConnection();
  stopHeartbeatTimer();
}

function stopHeartbeatTimer() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function stopRealtimeReconnectTimer() {
  if (realtimeReconnectTimer !== null) {
    window.clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
}

function stopRealtimeConnection() {
  realtimeShouldReconnect = false;
  stopRealtimeReconnectTimer();

  if (!realtimeSocket) {
    return;
  }

  const socket = realtimeSocket;
  realtimeSocket = null;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;

  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
}

function restartHeartbeatTimer() {
  stopHeartbeatTimer();

  if (!currentRoomCode.value || !activeParticipant.value) {
    return;
  }

  heartbeatTimer = window.setInterval(() => {
    void sendHeartbeat(false);
  }, 15000);
}

function handleRoomDeleted(roomCode: string) {
  clearStoredIdentity(roomCode);
  room.value = null;
  activeParticipant.value = null;
  stopSyncTimers();
  ui.notify('当前房间已被删除。', 'warning');
  void router.push(canManageRoom.value ? '/history' : '/game');
}

function handleRealtimeMessage(rawPayload: string) {
  try {
    const event = JSON.parse(rawPayload) as RoomRealtimeEvent;

    if (event.roomCode !== currentRoomCode.value) {
      return;
    }

    if (event.type === 'room.updated') {
      room.value = event.room;
      joinForm.roomCode = event.room.roomCode;
      syncIdentityWithRoom(event.room);
      return;
    }

    if (event.type === 'room.deleted') {
      handleRoomDeleted(event.roomCode);
    }
  } catch {
    return;
  }
}

function scheduleRealtimeReconnect() {
  if (!realtimeShouldReconnect || !currentRoomCode.value || realtimeReconnectTimer !== null) {
    return;
  }

  realtimeReconnectTimer = window.setTimeout(() => {
    realtimeReconnectTimer = null;
    connectRealtime();
  }, 2000);
}

function connectRealtime() {
  if (!currentRoomCode.value || realtimeSocket) {
    return;
  }

  const socket = new WebSocket(buildRealtimeRoomUrl(currentRoomCode.value));
  realtimeSocket = socket;

  socket.onopen = () => {
    if (realtimeSocket !== socket) {
      return;
    }

    void loadRoom(false);

    if (activeParticipant.value) {
      void sendHeartbeat(false);
    }
  };

  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      handleRealtimeMessage(event.data);
    }
  };

  socket.onerror = () => {
    if (realtimeSocket === socket) {
      socket.close();
    }
  };

  socket.onclose = () => {
    if (realtimeSocket === socket) {
      realtimeSocket = null;
      scheduleRealtimeReconnect();
    }
  };
}

function restartRoomSubscription() {
  stopRealtimeConnection();

  if (!currentRoomCode.value) {
    return;
  }

  realtimeShouldReconnect = true;
  connectRealtime();
}

function startStatusLoop(target: typeof creatingStatus, steps: string[], timerType: 'creating' | 'asking') {
  stopStatusLoop(timerType);

  let index = 0;
  target.value = steps[0] ?? '';

  const timerId = window.setInterval(() => {
    index = (index + 1) % steps.length;
    target.value = steps[index] ?? '';
  }, 1200);

  if (timerType === 'creating') {
    creatingStatusTimer = timerId;
    return;
  }

  askingStatusTimer = timerId;
}

function stopStatusLoop(timerType: 'creating' | 'asking') {
  if (timerType === 'creating') {
    if (creatingStatusTimer !== null) {
      window.clearInterval(creatingStatusTimer);
      creatingStatusTimer = null;
    }

    creatingStatus.value = '';
    return;
  }

  if (askingStatusTimer !== null) {
    window.clearInterval(askingStatusTimer);
    askingStatusTimer = null;
  }

  askingStatus.value = '';
}

async function sendHeartbeat(showError = false) {
  if (!room.value || !activeParticipant.value) {
    return;
  }

  try {
    await heartbeatRoom(room.value.roomId, activeParticipant.value.participantId);
  } catch (error) {
    if (showError) {
      ui.notify(extractErrorMessage(error), 'error');
    }
  }
}

async function copyRoomCode() {
  if (!room.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(room.value.roomCode);
    ui.notify('房间码已复制。', 'success');
  } catch {
    ui.notify('复制失败，请手动复制房间码。', 'warning');
  }
}

async function handleCreateRoom() {
  const displayName = createForm.displayName.trim();

  if (!displayName) {
    ui.notify('请先填写昵称。', 'warning');
    return;
  }

  creating.value = true;
  startStatusLoop(creatingStatus, creatingStatusSteps, 'creating');
  saveStoredDisplayName(displayName);

  try {
    const created = await createRoom({
      clientId: browserClientId,
      displayName,
      difficulty: createForm.difficulty,
      generationPrompt: createForm.generationPrompt.trim()
    });

    room.value = created.room;
    activeParticipant.value = created.participant;
    saveStoredIdentity(created.room.roomCode, created.participant);
    joinForm.displayName = created.participant.displayName;
    createForm.displayName = created.participant.displayName;
    await router.push(`/game/${created.room.roomCode}`);
    restartHeartbeatTimer();
    void sendHeartbeat(false);
    ui.notify('房间已创建，把房间码发给其他成员即可加入。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    creating.value = false;
    stopStatusLoop('creating');
  }
}

async function handleJoinRoom() {
  const targetRoomCode = (currentRoomCode.value || joinForm.roomCode).trim().toUpperCase();
  const displayName = joinForm.displayName.trim();

  if (!targetRoomCode) {
    ui.notify('请输入房间码。', 'warning');
    return;
  }

  if (!displayName) {
    ui.notify('请先填写昵称。', 'warning');
    return;
  }

  joining.value = true;
  saveStoredDisplayName(displayName);

  try {
    const joined = await joinRoom({
      roomCode: targetRoomCode,
      displayName,
      clientId: browserClientId
    });

    room.value = joined.room;
    activeParticipant.value = joined.participant;
    saveStoredIdentity(joined.room.roomCode, joined.participant);
    joinForm.roomCode = joined.room.roomCode;
    joinForm.displayName = joined.participant.displayName;
    createForm.displayName = joined.participant.displayName;

    if (currentRoomCode.value !== joined.room.roomCode) {
      await router.push(`/game/${joined.room.roomCode}`);
    }

    restartHeartbeatTimer();
    void sendHeartbeat(false);
    ui.notify('已加入房间。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    joining.value = false;
  }
}

async function handleAskQuestion() {
  if (!room.value || !activeParticipant.value) {
    return;
  }

  if (!question.value.trim()) {
    ui.notify('请输入问题。', 'warning');
    return;
  }

  asking.value = true;
  startStatusLoop(askingStatus, askingStatusSteps, 'asking');

  try {
    room.value = await askRoomQuestion(room.value.roomId, activeParticipant.value.participantId, question.value.trim());
    question.value = '';
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    asking.value = false;
    stopStatusLoop('asking');
  }
}

async function handleSubmitGuess() {
  if (!room.value || !activeParticipant.value) {
    return;
  }

  if (!finalGuess.value.trim()) {
    ui.notify('请先填写最终猜测。', 'warning');
    return;
  }

  guessing.value = true;

  try {
    room.value = await submitRoomFinalGuess(room.value.roomId, activeParticipant.value.participantId, finalGuess.value.trim());
    guessDialog.value = false;
    finalGuess.value = '';
    ui.notify(room.value.status === 'solved' ? '最终猜测通过，房间已破解。' : '最终猜测未通过，房间已结算。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    guessing.value = false;
  }
}

async function handleReveal() {
  if (!room.value || !activeParticipant.value) {
    return;
  }

  revealing.value = true;

  try {
    room.value = await revealRoom(room.value.roomId, activeParticipant.value.participantId);
    ui.notify('汤底已公开。', 'warning');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    revealing.value = false;
  }
}

async function handleDeleteCurrentRoom() {
  if (!room.value) {
    return;
  }

  const current = room.value;
  const confirmed = window.confirm(`确定要删除房间 ${current.roomCode} 吗？删除后无法恢复。`);

  if (!confirmed) {
    return;
  }

  deletingRoom.value = true;

  try {
    await deleteRoom(current.roomId);
    clearStoredIdentity(current.roomCode);
    room.value = null;
    activeParticipant.value = null;
    stopSyncTimers();
    ui.notify('房间已删除。', 'success');
    await router.push('/history');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    deletingRoom.value = false;
  }
}

watch(
  currentRoomCode,
  (nextRoomCode) => {
    joinForm.roomCode = nextRoomCode;

    if (!nextRoomCode) {
      room.value = null;
      activeParticipant.value = null;
      stopSyncTimers();
      return;
    }

    void loadRoom(true);
    restartRoomSubscription();
    restartHeartbeatTimer();
  },
  { immediate: true }
);

watch(
  () => activeParticipant.value?.participantId,
  () => {
    restartHeartbeatTimer();
  }
);

onMounted(() => {
  void loadConfig();
});

onBeforeUnmount(() => {
  stopSyncTimers();
  stopStatusLoop('creating');
  stopStatusLoop('asking');
});
</script>

<style scoped>
.message-stream {
  display: grid;
  gap: 14px;
  height: 560px;
  overflow-y: auto;
  align-content: start;
  padding-right: 6px;
  scrollbar-gutter: stable;
}

.message-item {
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(214, 225, 237, 0.85);
  background: rgba(248, 250, 253, 0.94);
}

.message-item--answer {
  background: rgba(232, 244, 255, 0.95);
}

.message-item--status,
.message-item--system {
  background: rgba(244, 248, 253, 0.88);
}

@media (max-width: 960px) {
  .message-stream {
    height: 420px;
  }
}
</style>
