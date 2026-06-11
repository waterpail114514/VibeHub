import { create } from 'zustand';

export const useStore = create((set) => ({
  serverUrl: 'http://localhost:3456',
  serverOnline: false,
  projects: [],
  projectsLoading: false,
  localStates: {},
  darkMode: false,
  showSettings: false,
  showCreate: false,
  showHelp: false,
  showLogin: false,
  showUpload: null,
  showConfirmPull: null,
  showHistory: null,
  showAi: null,
  showChat: null,
  showChangelog: null,
  showManage: null,
  openMenuId: null,
  openMenuProjectId: null,
  user: null,
  toasts: [],

  setServerUrl: (url) => set({ serverUrl: url }),
  setServerOnline: (o) => set({ serverOnline: o }),
  setProjects: (p) => set({ projects: p }),
  setProjectsLoading: (l) => set({ projectsLoading: l }),
  setUser: (u) => set({ user: u }),
  setDarkMode: (v) => set({ darkMode: v }),

  setLocalState: (id, state) => set((s) => ({
    localStates: { ...s.localStates, [id]: { ...s.localStates[id], ...state } }
  })),

  setShowSettings: (v) => set({ showSettings: v }),
  setShowCreate: (v) => set({ showCreate: v }),
  setShowHelp: (v) => set({ showHelp: v }),
  setShowLogin: (v) => set({ showLogin: v }),
  setShowUpload: (v) => set({ showUpload: v }),
  setShowConfirmPull: (v) => set({ showConfirmPull: v }),
  setShowHistory: (v) => set({ showHistory: v }),
  setShowAi: (v) => set({ showAi: v }),
  setShowChat: (v) => set({ showChat: v }),
  setShowChangelog: (v) => set({ showChangelog: v }),
  setShowManage: (v) => set({ showManage: v }),
  setOpenMenuId: (v) => set({ openMenuId: v }),
  setOpenMenuProjectId: (v) => set({ openMenuProjectId: v }),

  addToast: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })), 3500);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}));
