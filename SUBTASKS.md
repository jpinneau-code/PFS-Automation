# Subtasks Implementation Guide

## Overview

The PFS Automation system supports hierarchical tasks through a **self-referencing** structure in the `tasks` table. This allows for unlimited nesting levels while maintaining a simple and efficient database schema.

## Database Structure

### Key Column: `parent_task_id`

The `tasks` table includes a `parent_task_id` column that references `tasks.id`:

```sql
parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE
```

**Rules:**
- **Main Task**: `parent_task_id = NULL`
- **Subtask**: `parent_task_id = <parent_task_id>`
- **Sub-subtask**: `parent_task_id = <subtask_id>` (unlimited nesting)

### Inheritance Rules

1. **Stage Inheritance**: Subtasks inherit `stage_id` from their parent task
   - Subtasks should have `stage_id = NULL`
   - Application layer resolves the actual stage by traversing up the hierarchy

2. **Project Inheritance**: Subtasks must have the same `project_id` as their parent

3. **Cascade Delete**: When a parent task is deleted, all its subtasks are automatically deleted

## Example Hierarchy

```
📋 Task: Requirements Gathering (ID: 1, stage_id: 2)
   ├── Subtask: Backend API Development (ID: 9, parent: 1, stage: NULL)
   │   ├── Sub-subtask: Create User Endpoints (ID: 10, parent: 9)
   │   └── Sub-subtask: Create Project Endpoints (ID: 11, parent: 9)
   ├── Subtask: Frontend Integration (ID: 12, parent: 1)
   └── Subtask: Write Unit Tests (ID: 13, parent: 1)
```

## Database Queries

### Get All Main Tasks (No Parent)

```sql
SELECT * FROM tasks WHERE parent_task_id IS NULL;
```

### Get Direct Subtasks of a Task

```sql
SELECT * FROM tasks WHERE parent_task_id = 123;
```

### Get Complete Task Hierarchy (Recursive)

```sql
WITH RECURSIVE task_tree AS (
  SELECT *, 0 as level FROM tasks WHERE id = 123
  UNION ALL
  SELECT t.*, tt.level + 1
  FROM tasks t
  INNER JOIN task_tree tt ON t.parent_task_id = tt.id
)
SELECT * FROM task_tree ORDER BY level, id;
```

### Calculate Total Sold Days (Including Subtasks)

```sql
WITH RECURSIVE task_subtasks AS (
  SELECT * FROM tasks WHERE id = 123
  UNION ALL
  SELECT t.* FROM tasks t
  INNER JOIN task_subtasks ts ON t.parent_task_id = ts.id
)
SELECT SUM(sold_days) as total_sold_days FROM task_subtasks;
```

### Get Task Ancestors (Parent Chain)

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, task_name, parent_task_id, 0 as level
  FROM tasks WHERE id = 123
  UNION ALL
  SELECT t.id, t.task_name, t.parent_task_id, a.level + 1
  FROM tasks t
  INNER JOIN ancestors a ON t.id = a.parent_task_id
)
SELECT * FROM ancestors WHERE level > 0 ORDER BY level DESC;
```

## Helper Functions & Views

The file [backend/sql/task-helpers.sql](backend/sql/task-helpers.sql) provides:

### Functions

1. **`get_task_hierarchy(task_id)`**
   - Returns complete hierarchy with levels and paths
   - Usage: `SELECT * FROM get_task_hierarchy(1);`

2. **`get_task_total_sold_days(task_id)`**
   - Calculate total sold_days including all subtasks
   - Usage: `SELECT get_task_total_sold_days(1);`

3. **`get_task_ancestors(task_id)`**
   - Get all parent tasks up to root
   - Usage: `SELECT * FROM get_task_ancestors(10);`

4. **`is_task_complete_with_subtasks(task_id)`**
   - Check if task and ALL subtasks are done
   - Usage: `SELECT is_task_complete_with_subtasks(1);`

### Views

1. **`tasks_with_subtask_count`**
   - Shows each task with count of direct subtasks
   - Usage: `SELECT * FROM tasks_with_subtask_count;`

2. **`main_tasks_with_stats`**
   - Main tasks with aggregated statistics
   - Includes completion percentage
   - Usage: `SELECT * FROM main_tasks_with_stats WHERE project_id = 1;`

## Migration

### For Existing Databases

Run the migration script to add subtask support:

```bash
cd backend
pnpm run migrate:subtasks
```

This will:
- Add `parent_task_id` column to `tasks` table
- Create index on `parent_task_id`
- Add CASCADE delete constraint

### For New Installations

The `parent_task_id` column is automatically created during initial database setup.

## Testing with Sample Data

### Create Test Subtasks

```bash
cd backend
pnpm run seed:subtasks
```

This creates:
- 1 main task with 3 direct subtasks
- 2 sub-subtasks under one of the subtasks
- Total hierarchy of 3 levels

## API Implementation Guidelines

### Creating a Subtask

```typescript
// POST /api/tasks
{
  "parent_task_id": 123,        // Required for subtasks
  "project_id": 1,              // Inherited from parent
  "stage_id": null,             // Must be NULL for subtasks
  "task_name": "Subtask Name",
  "sold_days": 5.0,
  "responsible_id": 10,
  "priority": "high",
  "status": "todo"
}
```

### Business Logic to Implement

1. **Validation**
   - If `parent_task_id` is provided:
     - Verify parent task exists
     - Ensure `project_id` matches parent's `project_id`
     - Reject if `stage_id` is provided (subtasks inherit stage)

2. **Inheritance**
   - When querying a subtask's stage, traverse up to find first non-NULL `stage_id`

3. **Aggregation**
   - Parent task's total sold_days = own sold_days + sum of all subtasks' sold_days
   - Parent task completion = all subtasks must be "done"

4. **Deletion**
   - Deleting a parent automatically deletes all subtasks (CASCADE)
   - Warn user if deleting a task with subtasks

5. **Moving Tasks**
   - When moving a subtask to become a main task: set `parent_task_id = NULL`
   - When converting a main task to subtask: set `parent_task_id = <new_parent>`
   - Validate that this doesn't create circular references

## Frontend Display Guidelines

### Tree Structure

```
📋 Main Task (5d)
  ├─ 🔹 Subtask 1 (3d) [In Progress]
  │   └─ 🔸 Sub-subtask 1.1 (1d) [Done]
  ├─ 🔹 Subtask 2 (2d) [Todo]
  └─ 🔹 Subtask 3 (4d) [Blocked]

Total: 15 days (5 own + 10 from subtasks)
```

### Progress Calculation

```typescript
function calculateTaskProgress(task: Task, subtasks: Task[]): number {
  if (subtasks.length === 0) {
    return task.status === 'done' ? 100 : 0
  }

  const completedSubtasks = subtasks.filter(st => st.status === 'done').length
  return (completedSubtasks / subtasks.length) * 100
}
```

### Drag & Drop Considerations

- Allow dragging tasks to make them subtasks
- Prevent circular references (task can't be subtask of itself or its descendants)
- Update `project_id` and `stage_id` when moving between parents

## Performance Considerations

### Indexes

The following indexes ensure good performance:
- `idx_tasks_parent_task_id` - For finding subtasks
- `idx_tasks_project_id` - For project filtering
- `idx_tasks_stage_id` - For stage filtering

### Query Optimization

1. **Limit Recursion Depth**
   ```sql
   WITH RECURSIVE task_tree AS (
     SELECT *, 0 as level FROM tasks WHERE id = 123
     UNION ALL
     SELECT t.*, tt.level + 1
     FROM tasks t
     INNER JOIN task_tree tt ON t.parent_task_id = tt.id
     WHERE tt.level < 10  -- Prevent infinite loops
   )
   SELECT * FROM task_tree;
   ```

2. **Use CTEs for Complex Queries**
   - PostgreSQL optimizes Common Table Expressions well
   - Easier to read and maintain than nested subqueries

3. **Cache Aggregations**
   - Consider caching `total_sold_days` in parent tasks
   - Update cache when subtasks change
   - Trade-off: complexity vs performance

## Security Considerations

1. **Authorization**
   - Check user permissions on parent task before allowing subtask creation
   - Subtasks inherit parent's permissions

2. **Circular Reference Prevention**
   - Validate that `parent_task_id` doesn't create a cycle
   - Check at application layer before insert/update

3. **Bulk Operations**
   - Be cautious with bulk deletes (CASCADE will delete subtasks)
   - Provide warnings in UI

## Common Pitfalls

### ❌ Don't Do This

```typescript
// Setting stage_id on a subtask
{
  parent_task_id: 123,
  stage_id: 2,  // ❌ Wrong! Subtasks inherit stage
}

// Creating circular reference
task.parent_task_id = task.id  // ❌ Self-reference

// Forgetting to validate project_id match
subtask.project_id = 999  // ❌ Must match parent's project_id
```

### ✅ Do This Instead

```typescript
// Correct subtask creation
{
  parent_task_id: 123,
  stage_id: null,  // ✅ Correct
  project_id: parentTask.project_id  // ✅ Inherited
}

// Validate before setting parent
if (newParentId === taskId || isDescendant(taskId, newParentId)) {
  throw new Error('Circular reference detected')
}
```

## Migration Checklist

- [x] Add `parent_task_id` column to `tasks` table
- [x] Create index on `parent_task_id`
- [x] Update `initDatabase()` to include column in fresh installs
- [x] Create migration script for existing databases
- [x] Document business rules and constraints
- [x] Create helper SQL functions for common queries
- [x] Generate sample data with subtasks
- [ ] Implement API endpoints for subtask operations
- [ ] Add frontend components for hierarchical display
- [ ] Implement drag & drop for task reorganization
- [ ] Add tests for circular reference prevention

---

*Last Updated: 2026-01-14*
