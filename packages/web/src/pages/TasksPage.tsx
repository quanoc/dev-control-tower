import { useState } from 'react';
import { GitBranch, Plus, Users } from 'lucide-react';
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
    <main className="flex-1 flex flex-col">
      {/* Agent Role Bar */}
      <section className="border-b border-gray-800/50">
        <SectionHeader
          icon={<Users className="w-4 h-4 text-cyan-400" />}
          title="数字团队"
          badge="DIGITAL TEAMS"
          info={
            <span className="text-sm text-gray-500">
              已发现 <span className="text-cyan-400 font-mono font-semibold">{agents.length}</span> 个 Agent
            </span>
          }
          className="px-6 pt-6 pb-3"
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