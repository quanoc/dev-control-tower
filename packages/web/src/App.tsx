import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Settings, LayoutDashboard, GitBranch, Bot } from 'lucide-react';
import { TasksPage } from './pages/TasksPage';
import { AgentsPage } from './pages/AgentsPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { PipelinesPage } from './pages/PipelinesPage';
import { useAgentStore } from './store/agents';
import { useTaskStore } from './store/tasks';
import { api } from './api/client';
import type { PipelineTemplate } from '@pipeline/shared';

type Page = 'tasks' | 'agents' | 'components' | 'pipelines';

function App() {
  const agents = useAgentStore(s => s.agents);
  const selectedAgentId = useAgentStore(s => s.selectedAgentId);
  const selectAgent = useAgentStore(s => s.selectAgent);
  const fetchAgents = useAgentStore(s => s.fetchAgents);
  const tasks = useTaskStore(s => s.tasks);
  const fetchTasks = useTaskStore(s => s.fetchTasks);

  const [currentPage, setCurrentPage] = useState<Page>('tasks');
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Silently update data without showing loading states
  const refreshSilently = useCallback(async () => {
    try {
      await Promise.all([
        (async () => {
          const data = await api.agents.list();
          useAgentStore.setState({ agents: data, lastSync: new Date() });
        })(),
        (async () => {
          const data = await api.tasks.list();
          useTaskStore.setState({ tasks: data, loading: false });
        })(),
      ]);
      const tpl = await api.pipelines.listTemplates();
      setTemplates(tpl);
    } catch {
      // Silently ignore background refresh errors
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshSilently();
  }, [refreshSilently]);

  // Background refresh every 10s (silent, no loading state)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    refreshTimer.current = setInterval(refreshSilently, 10000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [refreshSilently]);

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    await refreshSilently();
    setManualRefreshing(false);
  };

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-100">AI研发控制台</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>运行: {runningCount}</span>
            <span>队列: {pendingCount}</span>
            <span>完成: {completedCount}</span>
            <button
              onClick={handleManualRefresh}
              disabled={manualRefreshing}
              className="p-1 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button className="p-1 hover:bg-gray-800 rounded transition-colors" title="设置">
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pb-0">
          <button
            onClick={() => setCurrentPage('tasks')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'tasks'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            任务控制台
          </button>
          <button
            onClick={() => setCurrentPage('agents')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'agents'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Bot className="w-4 h-4" />
            Agent
          </button>
          <button
            onClick={() => setCurrentPage('components')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'components'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            流水线组件
          </button>
          <button
            onClick={() => setCurrentPage('pipelines')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'pipelines'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            流水线模板
          </button>
        </div>
      </header>

      {/* Page Content */}
      {currentPage === 'tasks' && (
        <TasksPage
          templates={templates}
          onRefreshTasks={fetchTasks}
        />
      )}
      {currentPage === 'agents' && <AgentsPage />}
      {currentPage === 'components' && <ComponentsPage />}
      {currentPage === 'pipelines' && <PipelinesPage />}
    </div>
  );
}

export default App;