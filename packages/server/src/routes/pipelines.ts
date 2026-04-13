import { Router, type Router as RouterType } from 'express';
import * as queries from '../db/queries.js';
import { DEFAULT_PIPELINE_PHASES, DEFAULT_PIPELINE_STAGES, PRESET_TEMPLATES, flattenPhases } from '@pipeline/shared';
import type { PipelinePhase, PipelineComplexity } from '@pipeline/shared';

const router: RouterType = Router();

// GET /api/pipelines/templates - List all templates
router.get('/templates', (_req, res) => {
  const templates = queries.getAllTemplates();
  res.json(templates);
});

// GET /api/pipelines/templates/preset/:complexity - Get preset template
router.get('/templates/preset/:complexity', (req, res) => {
  const complexity = req.params.complexity as PipelineComplexity;
  const preset = PRESET_TEMPLATES[complexity];
  if (!preset) return res.status(400).json({ error: 'Invalid complexity level. Use: small, medium, large' });
  res.json({ name: preset.name, description: preset.description, phases: preset.phases, stages: flattenPhases(preset.phases) });
});

// POST /api/pipelines/templates - Create template
router.post('/templates', (req, res) => {
  const { name, description, phases, complexity } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const tmplPhases = (phases || DEFAULT_PIPELINE_PHASES) as PipelinePhase[];
  const tmplComplexity = complexity || 'medium';
  const id = queries.createTemplate(name, description || '', tmplPhases, tmplComplexity);
  res.status(201).json({ id, name, description, phases: tmplPhases, complexity: tmplComplexity });
});

// PUT /api/pipelines/templates/:id - Update template
router.put('/templates/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, phases, complexity } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const tmplPhases = (phases || DEFAULT_PIPELINE_PHASES) as PipelinePhase[];
  const tmplComplexity = complexity || 'medium';
  const success = queries.updateTemplate(id, name, description || '', tmplPhases, tmplComplexity);
  if (!success) return res.status(404).json({ error: 'template not found' });
  res.json({ id, name, description, phases: tmplPhases, complexity: tmplComplexity });
});

// DELETE /api/pipelines/templates/:id - Delete template
router.delete('/templates/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('DELETE template, id:', id);
  try {
    const success = queries.deleteTemplate(id);
    console.log('Delete result:', success);
    if (!success) return res.status(404).json({ error: 'template not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/pipelines/instances - List all instances
router.get('/instances', (_req, res) => {
  const instances = queries.getAllPipelineInstances();
  res.json(instances);
});

// POST /api/pipelines/instances - Create instance for a task
router.post('/instances', (req, res) => {
  const { taskId, templateId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId is required' });

  let stages = DEFAULT_PIPELINE_STAGES;
  if (templateId) {
    const template = queries.getTemplateById(templateId);
    if (template) stages = template.stages;
  }

  const id = queries.createPipelineInstance(taskId, templateId || null, stages);
  res.status(201).json({ id, taskId, templateId });
});

// ─── Pipeline Components API ───────────────────────────────────

// GET /api/pipelines/components - List components with pagination and filter
router.get('/components', (req, res) => {
  const actorType = req.query.actorType as string | undefined;
  const search = req.query.search as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;

  const result = queries.listComponents({ actorType, search, page, limit });
  res.json(result);
});

// GET /api/pipelines/components/:id - Get component by id
router.get('/components/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const component = queries.getComponentById(id);
  if (!component) return res.status(404).json({ error: 'component not found' });
  res.json(component);
});

// POST /api/pipelines/components - Create component
router.post('/components', (req, res) => {
  const { name, description, actor_type, action, agent_id, human_role, icon, optional } = req.body;
  if (!name || !actor_type || !action) {
    return res.status(400).json({ error: 'name, actor_type, and action are required' });
  }

  const id = queries.createComponent({ name, description, actor_type, action, agent_id, human_role, icon, optional });
  res.status(201).json({ id });
});

// PUT /api/pipelines/components/:id - Update component
router.put('/components/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, actor_type, action, agent_id, human_role, icon, optional } = req.body;

  const success = queries.updateComponent(id, { name, description, actor_type, action, agent_id, human_role, icon, optional });
  if (!success) return res.status(404).json({ error: 'component not found' });
  res.json({ success: true });
});

// DELETE /api/pipelines/components/:id - Delete component
router.delete('/components/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const success = queries.deleteComponent(id);
  if (!success) return res.status(404).json({ error: 'component not found' });
  res.status(204).send();
});

// POST /api/pipelines/components/generate-from-templates - Generate components from template steps
router.post('/components/generate-from-templates', (_req, res) => {
  const templates = queries.getAllTemplates();

  // Step 1: Collect unique step definitions from all templates
  const stepKeyMap = new Map<string, { step: any; phaseKey: string }>();

  for (const tmpl of templates) {
    for (const phase of tmpl.phases) {
      for (const step of phase.steps) {
        // Create a unique key based on step properties
        const key = [
          step.actorType,
          step.action,
          step.agentId || '',
          step.humanRole || '',
          step.optional ? 'optional' : 'required',
        ].join('|');

        if (!stepKeyMap.has(key)) {
          stepKeyMap.set(key, { step, phaseKey: phase.phaseKey });
        }
      }
    }
  }

  // Step 2: Create components for unique steps
  const componentIdMap = new Map<string, number>();

  for (const [key, { step }] of stepKeyMap) {
    // Check if similar component already exists
    const existingComponents = queries.listComponents({ search: step.label, page: 1, limit: 100 });
    const existing = existingComponents.items.find(c =>
      c.actor_type === step.actorType &&
      c.action === step.action &&
      c.agent_id === step.agentId &&
      c.human_role === step.humanRole
    );

    if (existing) {
      componentIdMap.set(key, existing.id);
    } else {
      // Create new component
      const icon = step.icon || '⚙️';
      const componentId = queries.createComponent({
        name: step.label,
        description: `${step.label} - ${step.action}`,
        actor_type: step.actorType,
        action: step.action,
        agent_id: step.agentId || null,
        human_role: step.humanRole || null,
        icon,
        optional: step.optional,
      });
      componentIdMap.set(key, componentId);
    }
  }

  // Step 3: Update templates with componentId references
  let templatesUpdated = 0;

  for (const tmpl of templates) {
    const updatedPhases = tmpl.phases.map(phase => ({
      ...phase,
      steps: phase.steps.map(step => {
        const key = [
          step.actorType,
          step.action,
          step.agentId || '',
          step.humanRole || '',
          step.optional ? 'optional' : 'required',
        ].join('|');

        const componentId = componentIdMap.get(key);
        return { ...step, componentId };
      }),
    }));

    // Only update if phases changed (componentId was added)
    const hasChanges = updatedPhases.some((phase, pi) =>
      phase.steps.some((step, si) => !tmpl.phases[pi]?.steps[si]?.componentId)
    );

    if (hasChanges) {
      queries.updateTemplate(tmpl.id, tmpl.name, tmpl.description, updatedPhases, tmpl.complexity);
      templatesUpdated++;
    }
  }

  res.json({
    success: true,
    componentsCreated: componentIdMap.size,
    templatesUpdated,
  });
});

export default router;
