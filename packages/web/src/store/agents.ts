import { create } from 'zustand';
import type { Agent } from '@pipeline/shared';
import { api } from '../api/client';

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  loading: boolean;
  lastSync: Date | null;

  fetchAgents: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  getAgent: (id: string) => Agent | undefined;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  loading: false,
  lastSync: null,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const agents = await api.agents.list();
      set({ agents, loading: false, lastSync: new Date() });
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      set({ loading: false });
    }
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  getAgent: (id) => get().agents.find(a => a.id === id),
}));
