import { useState } from 'react';
import { GitBranch, Plus, Users, RefreshCw } from 'lucide-react';
import { AgentBar } from '../components/AgentBar';
import { AgentDrawer } from '../components/AgentDrawer';
import { TaskList } from '../components/TaskList';
import { NewTaskDialog } from '../components/NewTaskDialog';
import { Button } from '../components/ui/Button';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useAgentStore } from '../store/agents';
import { useTaskStore } from '../store/tasks';
import type { PipelineTemplate } from '@pipeline/shared';

interface TasksPageProps {
  templates: PipelineTemplate[];
}

export function TasksPage({ templates }: TasksPageProps) {
  const agents = useAgentStore(s => s.agents);
  const selectedAgentId = useAgentStore(s => s.selectedAgentId);
  const selectAgent = useAgentStore(s => s.selectAgent);
  const tasks = useTaskStore(s => s.tasks);
  const fetchTasks = useTaskStore(s => s.fetchTasks);

  const [showNewTask, setShowNewTask] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Task statistics
  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Agent Role Bar */}
      <section className="border-b border-gray-800/50 px-6 pt-6 pb-3">
        <SectionHeader
          icon={<Users className="w-4 h-4 text-cyan-400" />}
          title="数字团队"
          badge="DIGITAL TEAMS"
          info={
            <span className="text-sm text-gray-500">
              已发现 <span className="text-cyan-400 font-mono font-semibold">{agents.length}</span> 个 Agent
            </span>
          }
          className="pt-1"
        />
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
      <section className="flex-1 px-6 py-6">
        <SectionHeader
          icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
          title="需求任务流水线"
          badge="TASK PIPELINE"
          info={
            <span className="text-xs text-gray-500 flex items-center gap-3">
              <span>运行: <span className="text-emerald-400">{runningCount}</span></span>
              <span>队列: <span className="text-amber-400">{pendingCount}</span></span>
              <span>完成: <span className="text-gray-300">{completedCount}</span></span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                title="刷新"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </span>
          }
          actions={
            <Button onClick={() => setShowNewTask(true)}>
              <Plus className="w-4 h-4" />
              新建需求
            </Button>
          }
          className="mb-5"
        />

        {/* Task List */}
        <TaskList />
      </section>

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
    </main>
  );
}