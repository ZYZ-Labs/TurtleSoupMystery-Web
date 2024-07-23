import {createStore, Store, useStore as baseUseStore} from 'vuex';
import {InjectionKey} from "vue";
import {MainState} from "../types/MainState.ts";
import {RootState} from "../types/RootState.ts";


// 定义 Vuex 模块
const mainStore = {
    state: (): MainState => ({
        headerStatus: false,
        footerStatus: true,
        headerTitle: ''
    }),
    mutations: {
        setHeaderStatus(state: MainState, headerStatus: boolean) {
            state.headerStatus = headerStatus;
        },
        setFooterStatus(state: MainState, footerStatus: boolean) {
            state.footerStatus = footerStatus;
        },
        setTitle(state: MainState, title: string) {
            state.headerTitle = title;
        }
    },
    actions: {
        updateHeaderStatus({commit}: { commit: Function }, headerStatus: boolean) {
            commit('setHeaderStatus', headerStatus);
        },
        updateFooterStatus({commit}: { commit: Function }, footerStatus: boolean) {
            commit('setFooterStatus', footerStatus);
        },
        updateTitle({commit}: { commit: Function }, title: string) {
            commit('setTitle', title);
        }
    },
    getters: {
        getHeaderStatus(state: MainState): boolean {
            return state.headerStatus;
        },
        getFooterStatus(state: MainState): boolean {
            return state.footerStatus;
        },
        getTitle(state: MainState): string {
            return state.headerTitle;
        }
    }
};

// 创建并导出 Vuex store 实例
const store = createStore<RootState>({
    modules: {
        main: mainStore
    }
});

export default store;

// 定义并导出类型安全的 `useStore` 钩子
export const key: InjectionKey<Store<RootState>> = Symbol();

export function useStore() {
    return baseUseStore(key);
}
