<template>
  <v-app>
    <SidebarNav :drawer="drawer" :rail="rail" @update:drawer="drawer = $event" />
    <TopBar
      :title="pageTitle"
      :status-text="statusText"
      :status-color="statusColor"
      @toggle-drawer="drawer = !drawer"
      @toggle-rail="toggleRail"
    />

    <v-main>
      <v-container fluid class="pa-4 pa-md-6">
        <div class="page-shell">
          <RouterView />
        </div>
      </v-container>
    </v-main>

    <AppSnackbar />
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRoute } from 'vue-router';
import AppSnackbar from '@/components/ui/AppSnackbar.vue';
import SidebarNav from '@/components/layout/SidebarNav.vue';
import TopBar from '@/components/layout/TopBar.vue';

const route = useRoute();
const display = useDisplay();
const drawer = ref(true);
const rail = ref(false);

watch(
  () => display.lgAndUp.value,
  (isDesktop) => {
    drawer.value = isDesktop;
  },
  { immediate: true }
);

const pageTitle = computed(() => String(route.meta.title ?? 'Turtle Soup Mystery'));
const statusText = computed(() => (route.path.startsWith('/settings') ? '配置模式' : '运行中'));
const statusColor = computed(() => (route.path.startsWith('/settings') ? 'secondary' : 'primary'));

function toggleRail() {
  if (display.lgAndUp.value) {
    rail.value = !rail.value;
  }
}
</script>
