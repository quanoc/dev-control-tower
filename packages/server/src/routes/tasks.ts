import { Router, type Router as RouterType } from 'express';
import * as queries from '../db/queries.js';
import { pipelineExecutor } from '../engine/executor.js';

const router: RouterType = Router();

// GET /api/tasks - List all tasks
router.get('/', (req, res) => {
  const status = req.query.status as string | undefined;
  const tasks = queries.getAllTasks(status);

  // Enrich with pipeline info
  const enrichedTasks = tasks.map(task => {
    const pipeline = queries.getPipelineInstanceByTaskId(task.id);
    return { ...task, pipeline };
  });

  res.json(enrichedTasks);
});

// GET /api/tasks/:id - Get task detail
router.get('/:id', (req, res) => {
  const task = queries.getTaskById(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const pipeline = queries.getPipelineInstanceByTaskId(task.id);
  res.json({ ...task, pipeline });
});

// POST /api/tasks - Create new task
router.post('/', async (req, res) => {
  const { title, description, templateId, autoStart } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const taskId = queries.createTask(title, description || '');

  // If template specified, create pipeline instance
  let instanceId: number | undefined;
  if (templateId) {
    const template = queries.getTemplateById(templateId);
    if (template) {
      instanceId = queries.createPipelineInstance(taskId, templateId, template.stages);
    }
  }

  // Auto-start if requested
  if (autoStart && instanceId) {
    // 异步启动，不阻塞响应
    pipelineExecutor.start(instanceId).catch(err => {
      console.error(`[Tasks] Failed to auto-start pipeline ${instanceId}:`, err);
    });
  }

  const task = queries.getTaskById(taskId);
  res.status(201).json(task);
});

// PUT /api/tasks/:id/status - Update task status
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  try {
    queries.updateTaskStatus(Number(req.params.id), status);
    const task = queries.getTaskById(Number(req.params.id));
    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/start - Start pipeline for a task
router.post('/:id/pipeline/start', async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const instance = queries.getPipelineInstanceByTaskId(taskId);
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.start(instance.id);
    res.json({ message: 'Pipeline started', instanceId: instance.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/retry - Retry failed stage
router.post('/:id/pipeline/retry', async (req, res) => {
  try {
    const { stageRunId } = req.body;
    if (!stageRunId) return res.status(400).json({ error: 'stageRunId is required' });

    const instance = queries.getPipelineInstanceByTaskId(Number(req.params.id));
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.retryStage(instance.id, stageRunId);
    res.json({ message: 'Stage retry initiated' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/approve - Approve a waiting human gate
router.post('/:id/pipeline/approve', async (req, res) => {
  try {
    const { stageRunId, comment } = req.body;
    if (!stageRunId) return res.status(400).json({ error: 'stageRunId is required' });

    const instance = queries.getPipelineInstanceByTaskId(Number(req.params.id));
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.approveStage(instance.id, stageRunId, comment);
    res.json({ message: 'Stage approved, pipeline resumed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/reject - Reject a waiting human gate
router.post('/:id/pipeline/reject', async (req, res) => {
  try {
    const { stageRunId, comment } = req.body;
    if (!stageRunId) return res.status(400).json({ error: 'stageRunId is required' });

    const instance = queries.getPipelineInstanceByTaskId(Number(req.params.id));
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.rejectStage(instance.id, stageRunId, comment);
    res.json({ message: 'Stage rejected, pipeline failed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/skip - Skip a failed stage and continue
router.post('/:id/pipeline/skip', async (req, res) => {
  try {
    const { stageRunId } = req.body;
    if (!stageRunId) return res.status(400).json({ error: 'stageRunId is required' });

    const instance = queries.getPipelineInstanceByTaskId(Number(req.params.id));
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.skipStage(instance.id, stageRunId);
    res.json({ message: 'Stage skipped, pipeline resumed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/tasks/:id/pipeline/stop - Stop a running pipeline
router.post('/:id/pipeline/stop', async (req, res) => {
  try {
    const instance = queries.getPipelineInstanceByTaskId(Number(req.params.id));
    if (!instance) return res.status(404).json({ error: 'No pipeline found for this task' });

    await pipelineExecutor.stop(instance.id);
    res.json({ message: 'Pipeline stopped' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    queries.deleteTask(id);
    res.status(204).send();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
