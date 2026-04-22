import { create } from 'zustand';

interface AgentSelectionStore {
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
}

export const useAgentSelection = create<AgentSelectionStore>((set) => ({
  selectedAgentId: null,
  selectAgent: (id) => set({ selectedAgentId: id }),
}));
