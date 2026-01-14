-- ============================================
-- HELPER VIEWS AND FUNCTIONS FOR TASKS
-- ============================================

-- View: tasks_with_subtask_count
-- Shows each task with the count of its direct subtasks
CREATE OR REPLACE VIEW tasks_with_subtask_count AS
SELECT
  t.*,
  COUNT(st.id) as subtask_count
FROM tasks t
LEFT JOIN tasks st ON st.parent_task_id = t.id
GROUP BY t.id;

COMMENT ON VIEW tasks_with_subtask_count IS 'Tasks with direct subtask count';

-- ============================================

-- Function: get_task_hierarchy(task_id)
-- Returns the complete hierarchy of a task (all levels)
CREATE OR REPLACE FUNCTION get_task_hierarchy(task_id_param INTEGER)
RETURNS TABLE (
  id INTEGER,
  parent_task_id INTEGER,
  task_name VARCHAR,
  level INTEGER,
  path TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE task_tree AS (
    -- Base case: the task itself
    SELECT
      t.id,
      t.parent_task_id,
      t.task_name,
      0 as level,
      t.task_name::TEXT as path
    FROM tasks t
    WHERE t.id = task_id_param

    UNION ALL

    -- Recursive case: children
    SELECT
      t.id,
      t.parent_task_id,
      t.task_name,
      tt.level + 1,
      tt.path || ' > ' || t.task_name
    FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.id
  )
  SELECT * FROM task_tree ORDER BY level, id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_hierarchy IS 'Get complete hierarchy of a task including all subtasks';

-- Usage: SELECT * FROM get_task_hierarchy(1);

-- ============================================

-- Function: get_task_total_sold_days(task_id)
-- Returns the sum of sold_days for a task and all its subtasks
CREATE OR REPLACE FUNCTION get_task_total_sold_days(task_id_param INTEGER)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  total DECIMAL(10, 2);
BEGIN
  WITH RECURSIVE task_subtasks AS (
    SELECT * FROM tasks WHERE id = task_id_param
    UNION ALL
    SELECT t.* FROM tasks t
    INNER JOIN task_subtasks ts ON t.parent_task_id = ts.id
  )
  SELECT SUM(sold_days) INTO total FROM task_subtasks;

  RETURN COALESCE(total, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_total_sold_days IS 'Calculate total sold_days including all subtasks';

-- Usage: SELECT get_task_total_sold_days(1);

-- ============================================

-- Function: get_task_ancestors(task_id)
-- Returns all ancestor tasks (parent, grandparent, etc.)
CREATE OR REPLACE FUNCTION get_task_ancestors(task_id_param INTEGER)
RETURNS TABLE (
  id INTEGER,
  task_name VARCHAR,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE ancestors AS (
    -- Base case: the task itself
    SELECT
      t.id,
      t.task_name,
      t.parent_task_id,
      0 as level
    FROM tasks t
    WHERE t.id = task_id_param

    UNION ALL

    -- Recursive case: parents
    SELECT
      t.id,
      t.task_name,
      t.parent_task_id,
      a.level + 1
    FROM tasks t
    INNER JOIN ancestors a ON t.id = a.parent_task_id
  )
  SELECT id, task_name, level FROM ancestors WHERE level > 0 ORDER BY level DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_ancestors IS 'Get all ancestor tasks (parent hierarchy)';

-- Usage: SELECT * FROM get_task_ancestors(10);

-- ============================================

-- Function: is_task_complete_with_subtasks(task_id)
-- Check if a task and ALL its subtasks are completed
CREATE OR REPLACE FUNCTION is_task_complete_with_subtasks(task_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  incomplete_count INTEGER;
BEGIN
  WITH RECURSIVE task_subtasks AS (
    SELECT * FROM tasks WHERE id = task_id_param
    UNION ALL
    SELECT t.* FROM tasks t
    INNER JOIN task_subtasks ts ON t.parent_task_id = ts.id
  )
  SELECT COUNT(*) INTO incomplete_count
  FROM task_subtasks
  WHERE status != 'done';

  RETURN incomplete_count = 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_task_complete_with_subtasks IS 'Check if task and all subtasks are done';

-- Usage: SELECT is_task_complete_with_subtasks(1);

-- ============================================

-- View: main_tasks_with_stats
-- Shows main tasks (no parent) with aggregated stats from subtasks
CREATE OR REPLACE VIEW main_tasks_with_stats AS
SELECT
  t.id,
  t.task_name,
  t.project_id,
  t.stage_id,
  t.status,
  t.priority,
  t.sold_days as own_sold_days,
  get_task_total_sold_days(t.id) as total_sold_days,
  COUNT(st.id) as total_subtasks,
  COUNT(CASE WHEN st.status = 'done' THEN 1 END) as completed_subtasks,
  CASE
    WHEN COUNT(st.id) = 0 THEN NULL
    ELSE ROUND(COUNT(CASE WHEN st.status = 'done' THEN 1 END)::NUMERIC / COUNT(st.id) * 100, 2)
  END as completion_percentage
FROM tasks t
LEFT JOIN LATERAL (
  WITH RECURSIVE subtasks AS (
    SELECT * FROM tasks WHERE parent_task_id = t.id
    UNION ALL
    SELECT tasks.* FROM tasks
    INNER JOIN subtasks ON tasks.parent_task_id = subtasks.id
  )
  SELECT * FROM subtasks
) st ON true
WHERE t.parent_task_id IS NULL
GROUP BY t.id, t.task_name, t.project_id, t.stage_id, t.status, t.priority, t.sold_days;

COMMENT ON VIEW main_tasks_with_stats IS 'Main tasks with aggregated subtask statistics';

-- Usage: SELECT * FROM main_tasks_with_stats WHERE project_id = 1;

-- ============================================
-- EXAMPLE QUERIES
-- ============================================

-- Get all main tasks with their completion status
-- SELECT id, task_name, total_subtasks, completion_percentage FROM main_tasks_with_stats ORDER BY id;

-- Get complete hierarchy of task 1
-- SELECT * FROM get_task_hierarchy(1);

-- Calculate total days for task 1 and its subtasks
-- SELECT get_task_total_sold_days(1);

-- Check if task 1 is completely done
-- SELECT is_task_complete_with_subtasks(1);

-- Get all ancestors of subtask 10
-- SELECT * FROM get_task_ancestors(10);

-- Find all tasks that have subtasks
-- SELECT * FROM tasks_with_subtask_count WHERE subtask_count > 0;
