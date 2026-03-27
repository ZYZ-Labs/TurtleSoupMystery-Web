import { StateStore } from '../storage/stateStore.js';

const store = new StateStore();
await store.ensureInitialized();

console.log('Initialized runtime storage at backend/data/runtime/app-state.json');
