import { create } from 'zustand';
import type { Task } from '@pipeline/shared';
import { api } from '../api/client';

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  filter: string | null;

  fetchTasks: () => Promise<void>;
  createTask: (title: string, description: string, templateId?: number) => Promise<void>;
  startTaskPipeline: (id: number) => Promise<void>;
  approveTaskStage: (id: number, stageRunId: number) => Promise<void>;
  retryTaskStage: (id: number, stageRunId: number) => Promise<void>;
  skipTaskStage: (id: number, stageRunId: number) => Promise<void>;
  setFilter: (status: string | null) => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  filter: null,

  fetchTasks: async () => {
    set({ loading: true });
    try {
      const tasks = await api.tasks.list(get().filter ?? undefined);
      set({ tasks, loading: false });
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      set({ loading: false });
    }
  },

  createTask: async (title, description, templateId) => {
    const task = await api.tasks.create({ title, description, templateId });
    set(state => ({ tasks: [task, ...state.tasks] }));
  },

  startTaskPipeline: async (id) => {
    await api.tasks.startPipeline(id);
    await get().fetchTasks();
  },

  approveTaskStage: async (id, stageRunId) => {
    await api.tasks.approveStage(id, stageRunId);
    await get().fetchTasks();
  },

  retryTaskStage: async (id, stageRunId) => {
    await api.tasks.retryStage(id, stageRunId);
    await get().fetchTasks();
  },

  skipTaskStage: async (id, stageRunId) => {
    await api.tasks.skipStage(id, stageRunId);
    await get().fetchTasks();
  },

  setFilter: (status) => set({ filter: status }),
}));
