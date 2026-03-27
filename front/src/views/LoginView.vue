<template>
  <div class="login-shell">
    <v-card class="glass-card login-card">
      <v-card-title class="section-title px-6 pt-6">管理员登录</v-card-title>
      <v-card-text class="pt-4">
        <p class="text-body-2 text-medium-emphasis mb-5">
          登录后才能进入“房间历史”和“系统设置”。
        </p>

        <v-text-field v-model="username" label="用户名" class="mb-4" />
        <v-text-field
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          label="密码"
          class="mb-5"
        >
          <template #append-inner>
            <v-btn
              size="small"
              variant="text"
              :text="showPassword ? '隐藏' : '显示'"
              @click="showPassword = !showPassword"
            />
          </template>
        </v-text-field>

        <div class="d-flex flex-wrap align-center justify-space-between ga-3">
          <div class="text-body-2 text-medium-emphasis">
            默认账号可通过环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 覆盖。
          </div>
          <v-btn color="primary" :loading="submitting" @click="handleLogin">登录</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { extractErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const username = ref('admin');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);

const redirectTarget = computed(() => {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/history';
});

async function handleLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    ui.notify('请输入用户名和密码。', 'warning');
    return;
  }

  submitting.value = true;

  try {
    await auth.login(username.value.trim(), password.value);
    ui.notify('登录成功。', 'success');
    await router.replace(redirectTarget.value);
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-card {
  width: min(100%, 520px);
}
</style>
