import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AgentBar } from '../components/AgentBar';
import { AgentDrawer } from '../components/AgentDrawer';
import { TaskList } from '../components/TaskList';
import { NewTaskDialog } from '../components/NewTaskDialog';
import { useAgentStore } from '../store/agents';
import { useTaskStore } from '../store/tasks';
import type { PipelineTemplate } from '@pipeline/shared';

interface TasksPageProps {
  templates: PipelineTemplate[];
  onRefreshTasks: () => Promise<void>;
}

export function TasksPage({ templates, onRefreshTasks }: TasksPageProps) {
  const agents = useAgentStore(s => s.agents);
  const selectedAgentId = useAgentStore(s => s.selectedAgentId);
  const selectAgent = useAgentStore(s => s.selectAgent);
  const fetchTasks = useTaskStore(s => s.fetchTasks);

  const [showNewTask, setShowNewTask] = useState(false);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
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
  );
}