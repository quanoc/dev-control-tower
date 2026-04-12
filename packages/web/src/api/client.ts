import type { Agent, Task, PipelineTemplate, PipelineInstance, CreateTaskRequest, PipelineComplexity, PipelinePhase } from '@pipeline/shared';

const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  // Agents
  agents: {
    list: () => request<Agent[]>('/agents'),
    getById: (id: string) => request<Agent>(`/agents/${id}`),
    sendCommand: (id: string, message: string) =>
      request<any>(`/agents/${id}/command`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
  },

  // Tasks
  tasks: {
    list: (status?: string) => request<Task[]>(`/tasks${status ? `?status=${status}` : ''}`),
    getById: (id: number) => request<Task>(`/tasks/${id}`),
    create: (data: CreateTaskRequest) =>
      request<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStatus: (id: number, status: string) =>
      request<Task>(`/tasks/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    startPipeline: (id: number) =>
      request<any>(`/tasks/${id}/pipeline/start`, { method: 'POST' }),
    retryStage: (id: number, stageRunId: number) =>
      request<any>(`/tasks/${id}/pipeline/retry`, {
        method: 'POST',
        body: JSON.stringify({ stageRunId }),
      }),
  },

  // Pipelines
  pipelines: {
    listTemplates: () => request<PipelineTemplate[]>('/pipelines/templates'),
    createTemplate: (name: string, description: string, phases: PipelinePhase[], complexity: PipelineComplexity = 'medium') =>
      request<PipelineTemplate>('/pipelines/templates', {
        method: 'POST',
        body: JSON.stringify({ name, description, phases, complexity }),
      }),
    updateTemplate: (id: number, name: string, description: string, phases: PipelinePhase[], complexity: PipelineComplexity = 'medium') =>
      request<PipelineTemplate>(`/pipelines/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, phases, complexity }),
      }),
    getPresetTemplate: (complexity: PipelineComplexity) =>
      request<{ name: string; description: string; phases: PipelinePhase[] }>(`/pipelines/templates/preset/${complexity}`),
    deleteTemplate: (id: number) =>
      request<void>(`/pipelines/templates/${id}`, { method: 'DELETE' }),
    // Components
    listComponents: (options?: { actorType?: string; search?: string; page?: number; limit?: number }) => {
      const params = new URLSearchParams();
      if (options?.actorType) params.set('actorType', options.actorType);
      if (options?.search) params.set('search', options.search);
      if (options?.page) params.set('page', String(options.page));
      if (options?.limit) params.set('limit', String(options.limit));
      const query = params.toString();
      return request<{ items: any[]; total: number; page: number; limit: number }>(
        `/pipelines/components${query ? '?' + query : ''}`
      );
    },
    getComponent: (id: number) => request<any>(`/pipelines/components/${id}`),
    createComponent: (data: {
      name: string;
      description?: string;
      actor_type: string;
      action: string;
      agent_id?: string;
      human_role?: string;
      icon?: string;
      execution?: string;
      optional?: boolean;
    }) => request<{ id: number }>('/pipelines/components', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    updateComponent: (id: number, data: Partial<{
      name: string;
      description: string;
      actor_type: string;
      action: string;
      agent_id: string;
      human_role: string;
      icon: string;
      execution: string;
      optional: boolean;
    }>) => request<{ success: boolean }>(`/pipelines/components/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    deleteComponent: (id: number) =>
      request<void>(`/pipelines/components/${id}`, { method: 'DELETE' }),
    generateFromTemplates: () =>
      request<{ success: boolean; componentsCreated: number; templatesUpdated: number }>(
        '/pipelines/components/generate-from-templates',
        { method: 'POST' }
      ),
    listInstances: () => request<PipelineInstance[]>('/pipelines/instances'),
    createInstance: (taskId: number, templateId: number) =>
      request<any>('/pipelines/instances', {
        method: 'POST',
        body: JSON.stringify({ taskId, templateId }),
      }),
  },
};
