import { useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, GitBranch, Bot } from 'lucide-react';
import { TasksPage } from './pages/TasksPage';
import { AgentsPage } from './pages/AgentsPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { PipelinesPage } from './pages/PipelinesPage';
import { ThemeToggle } from './components/ThemeToggle';
import { ChatWidget } from './components/ChatWidget';
import { useAgentStore } from './store/agents';
import { useTaskStore } from './store/tasks';
import { useThemeStore } from './store/theme';
import { api } from './api/client';
import type { PipelineTemplate } from '@pipeline/shared';

type Page = 'tasks' | 'agents' | 'components' | 'pipelines';

function App() {
  const fetchAgents = useAgentStore(s => s.fetchAgents);
  const theme = useThemeStore(s => s.theme);

  const [currentPage, setCurrentPage] = useState<Page>('tasks');
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);

  // Sync theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Initial load only
  const loadData = useCallback(async () => {
    try {
      await Promise.all([
        fetchAgents(),
        useTaskStore.getState().fetchTasks(),
      ]);
      const tpl = await api.pipelines.listTemplates();
      setTemplates(tpl);
    } catch {
      // Silently ignore errors
    }
  }, [fetchAgents]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-sticky">
        <div className="flex items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">AI研发控制台</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-500">
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pb-0">
          <button
            onClick={() => setCurrentPage('tasks')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'tasks'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            任务控制台
          </button>
          <button
            onClick={() => setCurrentPage('agents')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'agents'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Bot className="w-4 h-4" />
            Agent
          </button>
          <button
            onClick={() => setCurrentPage('components')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'components'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            流水线组件
          </button>
          <button
            onClick={() => setCurrentPage('pipelines')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              currentPage === 'pipelines'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            流水线模板
          </button>
        </div>
      </header>

      {/* Page Content */}
      {currentPage === 'tasks' && (
        <TasksPage templates={templates} />
      )}
      {currentPage === 'agents' && <AgentsPage />}
      {currentPage === 'components' && <ComponentsPage />}
      {currentPage === 'pipelines' && <PipelinesPage />}

      {/* 小研助手 */}
      <ChatWidget />
    </div>
  );
}

export default App;