import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, RefreshCw, Settings, LayoutDashboard, GitBranch } from 'lucide-react';
import { AgentBar } from './components/AgentBar';
import { AgentDrawer } from './components/AgentDrawer';
import { TaskList } from './components/TaskList';
import { NewTaskDialog } from './components/NewTaskDialog';
import { PipelineManager } from './components/PipelineManager';
import { ComponentLibrary } from './components/ComponentLibrary';
import { useAgentStore } from './store/agents';
import { useTaskStore } from './store/tasks';
import { api } from './api/client';
import type { PipelineTemplate } from '@pipeline/shared';

type Page = 'tasks' | 'pipelines' | 'components';

function App() {
  const agents = useAgentStore(s => s.agents);
  const selectedAgentId = useAgentStore(s => s.selectedAgentId);
  const selectAgent = useAgentStore(s => s.selectAgent);
  const fetchAgents = useAgentStore(s => s.fetchAgents);
  const tasks = useTaskStore(s => s.tasks);
  const fetchTasks = useTaskStore(s => s.fetchTasks);

  const [currentPage, setCurrentPage] = useState<Page>('tasks');
  const [showNewTask, setShowNewTask] = useState(false);
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

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
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
      {currentPage === 'tasks' ? (
        <>
          {/* Agent Role Bar */}
          <section className="border-b border-gray-800/50">
            <div className="flex items-center justify-between px-6 pt-3 pb-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <span>👥</span>
                <span>数字团队</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">DIGITAL TEAMS</span>
                <span className="text-xs text-gray-500 ml-2">
                  已发现 <span className="text-cyan-400 font-mono font-semibold">{agents.length}</span> 个 Agent
                </span>
              </h2>
            </div>
            <AgentBar
              agents={agents}
              selectedId={selectedAgentId}
              onSelect={selectAgent}
            />
          </section>

          {/* Agent Detail Drawer */}
          {selectedAgent && (
            <AgentDrawer agent={selectedAgent} onClose={() => selectAgent(null)} />
          )}

          {/* Main Content */}
          <main className="flex-1 px-6 py-4">
            {/* Task toolbar */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <span>📋</span>
                <span>需求任务流水线</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">TASK PIPELINE</span>
              </h2>
              <button
                onClick={() => setShowNewTask(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建需求
              </button>
            </div>

            {/* Task List */}
            <TaskList />
          </main>

          {/* New Task Dialog */}
          {showNewTask && (
            <NewTaskDialog
              templates={templates}
              onClose={() => setShowNewTask(false)}
              onSuccess={() => {
                setShowNewTask(false);
                fetchTasks();
              }}
            />
          )}
        </>
      ) : currentPage === 'components' ? (
        /* Pipeline Components Page */
        <main className="flex-1 px-6 py-6">
          <ComponentLibrary />
        </main>
      ) : (
        /* Pipeline Templates Page */
        <main className="flex-1 px-6 py-6">
          <PipelineManager />
        </main>
      )}
    </div>
  );
}

export default App;