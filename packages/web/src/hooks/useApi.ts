import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CreateTaskRequest, PipelineComplexity, PipelinePhase } from '@pipeline/shared';

// Agents
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: api.agents.list,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => api.agents.getById(id),
    enabled: !!id,
  });
}

export function useClaudeAgents() {
  return useQuery({
    queryKey: ['agents', 'claude'],
    queryFn: api.agents.listClaude,
  });
}

export function useOpenclawAgents() {
  return useQuery({
    queryKey: ['agents', 'openclaw'],
    queryFn: api.agents.listOpenclaw,
  });
}

export function useSyncAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.agents.sync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.agents.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.agents.update>[1] }) =>
      api.agents.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.agents.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useSendAgentCommand() {
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      api.agents.sendCommand(id, message),
  });
}

// Tasks
export function useTasks(status?: string) {
  return useQuery({
    queryKey: ['tasks', status],
    queryFn: () => api.tasks.list(status),
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.tasks.getById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.tasks.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useStartPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.tasks.startPipeline,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useRetryStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, stageRunId }: { taskId: number; stageRunId: number }) =>
      api.tasks.retryStage(taskId, stageRunId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useApproveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, stageRunId }: { taskId: number; stageRunId: number }) =>
      api.tasks.approveStage(taskId, stageRunId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useSkipStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, stageRunId }: { taskId: number; stageRunId: number }) =>
      api.tasks.skipStage(taskId, stageRunId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// Pipelines
export function usePipelineTemplates() {
  return useQuery({
    queryKey: ['pipelines', 'templates'],
    queryFn: api.pipelines.listTemplates,
  });
}

export function usePresetTemplate(complexity: PipelineComplexity) {
  return useQuery({
    queryKey: ['pipelines', 'preset', complexity],
    queryFn: () => api.pipelines.getPresetTemplate(complexity),
  });
}

export function useCreatePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      description,
      phases,
      complexity,
    }: {
      name: string;
      description: string;
      phases: PipelinePhase[];
      complexity?: PipelineComplexity;
    }) => api.pipelines.createTemplate(name, description, phases, complexity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'templates'] }),
  });
}

export function useUpdatePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      description,
      phases,
      complexity,
    }: {
      id: number;
      name: string;
      description: string;
      phases: PipelinePhase[];
      complexity?: PipelineComplexity;
    }) => api.pipelines.updateTemplate(id, name, description, phases, complexity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'templates'] }),
  });
}

export function useDeletePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.pipelines.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'templates'] }),
  });
}

export function usePipelineComponents(options?: {
  actorType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['pipelines', 'components', options],
    queryFn: () => api.pipelines.listComponents(options),
  });
}

export function usePipelineComponent(id: number) {
  return useQuery({
    queryKey: ['pipelines', 'components', id],
    queryFn: () => api.pipelines.getComponent(id),
    enabled: !!id,
  });
}

export function useCreatePipelineComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.pipelines.createComponent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'components'] }),
  });
}

export function useUpdatePipelineComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.pipelines.updateComponent>[1] }) =>
      api.pipelines.updateComponent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'components'] }),
  });
}

export function useDeletePipelineComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.pipelines.deleteComponent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'components'] }),
  });
}

export function useGenerateComponentsFromTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.pipelines.generateFromTemplates,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines', 'components'] });
      qc.invalidateQueries({ queryKey: ['pipelines', 'templates'] });
    },
  });
}

export function usePipelineInstances() {
  return useQuery({
    queryKey: ['pipelines', 'instances'],
    queryFn: api.pipelines.listInstances,
  });
}

export function useCreatePipelineInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, templateId }: { taskId: number; templateId: number }) =>
      api.pipelines.createInstance(taskId, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', 'instances'] }),
  });
}

// Chat
export function useChatHistory(taskId?: number) {
  return useQuery({
    queryKey: ['chat', 'history', taskId],
    queryFn: () => api.chat.getHistory(taskId),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, taskId }: { message: string; taskId?: number }) =>
      api.chat.sendMessage(message, taskId),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['chat', 'history', vars.taskId] }),
  });
}

export function useClearChatHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.chat.clearHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'history'] }),
  });
}
