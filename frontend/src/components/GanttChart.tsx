'use client'

import React, { useState, useMemo } from 'react'

interface Task {
  id: number
  task_name: string
  status: string
  start_date: string | null
  due_date: string | null
  subtasks: Task[]
  [key: string]: any // Allow extra properties
}

interface Stage {
  id: number
  stage_name: string
  tasks: Task[]
  [key: string]: any // Allow extra properties
}

interface GanttChartProps {
  stages: Stage[]
  unstagedTasks: Task[]
  weekStartsOn: 'monday' | 'sunday'
  expandedStages: Set<number>
  expandedTasks: Set<number>
  addingTaskInStage: number | null
  addingSubtaskInTask: number | null
  onTaskClick?: (task: any) => void
  onStageClick?: (stage: any) => void
}

// Get the Monday (or Sunday) of the week containing a date
const getWeekStart = (date: Date, weekStartsOn: 'monday' | 'sunday'): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = weekStartsOn === 'monday'
    ? (day === 0 ? -6 : 1 - day)
    : -day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Add weeks to a date
const addWeeks = (date: Date, weeks: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

// Format date for display
const formatWeekHeader = (date: Date): string => {
  const weekNum = getWeekNumber(date)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `S${weekNum} - ${day}/${month}`
}

// Get ISO week number
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Get status color for bars
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'todo': return 'bg-gray-400'
    case 'in_progress': return 'bg-blue-500'
    case 'review': return 'bg-purple-500'
    case 'blocked': return 'bg-red-500'
    case 'done': return 'bg-green-500'
    default: return 'bg-gray-400'
  }
}

// Calculate bar position and width
const calculateBarPosition = (
  startDate: string | null,
  endDate: string | null,
  weeks: Date[],
  weekWidth: number
): { left: number; width: number; visible: boolean } => {
  if (!startDate && !endDate) {
    return { left: 0, width: 0, visible: false }
  }

  const firstWeekStart = weeks[0]
  const lastWeekEnd = addWeeks(weeks[weeks.length - 1], 1)

  const start = startDate ? new Date(startDate) : new Date(endDate!)
  const end = endDate ? new Date(endDate) : new Date(startDate!)

  // Check if bar is visible in current range
  if (end < firstWeekStart || start >= lastWeekEnd) {
    return { left: 0, width: 0, visible: false }
  }

  // Calculate position
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const startOffset = Math.max(0, (start.getTime() - firstWeekStart.getTime()) / msPerWeek)
  const endOffset = Math.min(weeks.length, (end.getTime() - firstWeekStart.getTime()) / msPerWeek + 1)

  const left = startOffset * weekWidth
  const width = Math.max((endOffset - startOffset) * weekWidth - 2, 4)

  return { left, width, visible: true }
}

// Get stage date range from its tasks
const getStageDateRange = (stage: Stage): { start: string | null; end: string | null } => {
  const dates: Date[] = []

  const checkTask = (task: Task) => {
    if (task.start_date) dates.push(new Date(task.start_date))
    if (task.due_date) dates.push(new Date(task.due_date))
    task.subtasks?.forEach(checkTask)
  }

  stage.tasks.forEach(checkTask)

  if (dates.length === 0) {
    return { start: null, end: null }
  }

  const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
  const latest = new Date(Math.max(...dates.map(d => d.getTime())))

  return {
    start: earliest.toISOString(),
    end: latest.toISOString()
  }
}

// Get task date range (from subtasks if any)
const getTaskDateRange = (task: Task): { start: string | null; end: string | null } => {
  if (!task.subtasks || task.subtasks.length === 0) {
    return { start: task.start_date, end: task.due_date }
  }

  const dates: Date[] = []

  const checkSubtask = (subtask: Task) => {
    const range = getTaskDateRange(subtask)
    if (range.start) dates.push(new Date(range.start))
    if (range.end) dates.push(new Date(range.end))
  }

  task.subtasks.forEach(checkSubtask)

  if (dates.length === 0) {
    return { start: null, end: null }
  }

  const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
  const latest = new Date(Math.max(...dates.map(d => d.getTime())))

  return {
    start: earliest.toISOString(),
    end: latest.toISOString()
  }
}

export default function GanttChart({
  stages,
  unstagedTasks,
  weekStartsOn,
  expandedStages,
  expandedTasks,
  addingTaskInStage,
  addingSubtaskInTask,
  onTaskClick,
  onStageClick
}: GanttChartProps) {
  const [startWeekOffset, setStartWeekOffset] = useState(0)
  const weeksToShow = 20
  const weekWidth = 60 // pixels per week

  // Row heights to match table - must match py-3/py-2 in table rows
  const stageRowHeight = 44 // matches py-3 px-4 stage row
  const taskRowHeight = 36  // matches py-2 px-4 task row

  // Calculate the weeks to display
  const weeks = useMemo(() => {
    const today = new Date()
    const currentWeekStart = getWeekStart(today, weekStartsOn)
    const startDate = addWeeks(currentWeekStart, startWeekOffset)

    return Array.from({ length: weeksToShow }, (_, i) => addWeeks(startDate, i))
  }, [startWeekOffset, weekStartsOn])

  // Check if current week is visible
  const isCurrentWeekVisible = useMemo(() => {
    const today = new Date()
    const currentWeekStart = getWeekStart(today, weekStartsOn)
    return weeks.some(w => w.getTime() === currentWeekStart.getTime())
  }, [weeks, weekStartsOn])

  // Render a bar for a task
  const renderTaskBar = (task: Task, isSubtask: boolean = false) => {
    const range = getTaskDateRange(task)
    const { left, width, visible } = calculateBarPosition(range.start, range.end, weeks, weekWidth)

    if (!visible) return null

    return (
      <div
        key={`task-${task.id}`}
        className={`absolute h-5 rounded cursor-pointer transition-opacity hover:opacity-80 ${getStatusColor(task.status)}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onTaskClick?.(task)
        }}
        title={`${task.task_name}${range.start ? `\nStart: ${new Date(range.start).toLocaleDateString('fr-FR')}` : ''}${range.end ? `\nEnd: ${new Date(range.end).toLocaleDateString('fr-FR')}` : ''}`}
      >
        {width > 50 && (
          <span className="text-xs text-white truncate px-1 leading-5">
            {task.task_name}
          </span>
        )}
      </div>
    )
  }

  // Render a bar for a stage
  const renderStageBar = (stage: Stage) => {
    const range = getStageDateRange(stage)
    const { left, width, visible } = calculateBarPosition(range.start, range.end, weeks, weekWidth)

    if (!visible) return null

    return (
      <div
        key={`stage-${stage.id}`}
        className="absolute h-6 rounded bg-indigo-600 cursor-pointer transition-opacity hover:opacity-80"
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onStageClick?.(stage)
        }}
        title={`${stage.stage_name}${range.start ? `\nStart: ${new Date(range.start).toLocaleDateString('fr-FR')}` : ''}${range.end ? `\nEnd: ${new Date(range.end).toLocaleDateString('fr-FR')}` : ''}`}
      >
        {width > 60 && (
          <span className="text-xs text-white font-medium truncate px-2 leading-6">
            {stage.stage_name}
          </span>
        )}
      </div>
    )
  }

  // Render task rows recursively (respecting expansion state)
  const renderTaskRows = (tasks: Task[], level: number = 0, stageId?: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = []

    tasks.forEach((task) => {
      const hasSubtasks = task.subtasks && task.subtasks.length > 0
      const isExpanded = expandedTasks.has(task.id)

      // Task row
      rows.push(
        <div
          key={`task-row-${task.id}`}
          className={`relative border-b border-gray-100 ${level > 0 ? 'bg-gray-50/30' : ''}`}
          style={{
            width: `${weeksToShow * weekWidth}px`,
            height: `${taskRowHeight}px`
          }}
        >
          <div className="absolute inset-0 flex items-center">
            {renderTaskBar(task, level > 0)}
          </div>
          {/* Week grid lines */}
          <div className="absolute inset-0 flex pointer-events-none">
            {weeks.map((_, i) => (
              <div key={i} className="flex-shrink-0 border-r border-gray-50" style={{ width: `${weekWidth}px` }} />
            ))}
          </div>
        </div>
      )

      // Subtask rows (only if expanded)
      if (hasSubtasks && isExpanded) {
        rows.push(...renderTaskRows(task.subtasks, level + 1))
      }

      // Add subtask input row if adding subtask to this task
      if (addingSubtaskInTask === task.id) {
        rows.push(
          <div
            key={`add-subtask-row-${task.id}`}
            className="relative border-b border-gray-100 bg-indigo-50/30"
            style={{
              width: `${weeksToShow * weekWidth}px`,
              height: `${taskRowHeight}px`
            }}
          >
            <div className="absolute inset-0 flex pointer-events-none">
              {weeks.map((_, i) => (
                <div key={i} className="flex-shrink-0 border-r border-gray-50" style={{ width: `${weekWidth}px` }} />
              ))}
            </div>
          </div>
        )
      }
    })

    return rows
  }

  // Render empty row (for "No tasks" or "Add task" placeholders)
  const renderEmptyRow = (key: string, bgClass: string = '') => (
    <div
      key={key}
      className={`relative border-b border-gray-100 ${bgClass}`}
      style={{
        width: `${weeksToShow * weekWidth}px`,
        height: `${taskRowHeight}px`
      }}
    >
      <div className="absolute inset-0 flex pointer-events-none">
        {weeks.map((_, i) => (
          <div key={i} className="flex-shrink-0 border-r border-gray-50" style={{ width: `${weekWidth}px` }} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <div className="flex items-center gap-2 px-4 bg-gray-100 border-b border-gray-200 h-[34px]">
        <button
          onClick={() => setStartWeekOffset(prev => prev - 20)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
          title="Previous 20 weeks"
        >
          ◀◀ -20
        </button>
        <button
          onClick={() => setStartWeekOffset(prev => prev - 4)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
          title="Previous 4 weeks"
        >
          ◀ -4
        </button>
        <button
          onClick={() => setStartWeekOffset(0)}
          className={`px-3 py-1 text-xs border rounded ${isCurrentWeekVisible ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          title="Go to current week"
        >
          Today
        </button>
        <button
          onClick={() => setStartWeekOffset(prev => prev + 4)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
          title="Next 4 weeks"
        >
          +4 ▶
        </button>
        <button
          onClick={() => setStartWeekOffset(prev => prev + 20)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
          title="Next 20 weeks"
        >
          +20 ▶▶
        </button>
      </div>

      {/* Gantt content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {/* Week headers */}
        <div className="sticky top-0 z-10 flex bg-gray-50 border-b border-gray-200 h-[44px]">
          {weeks.map((week, i) => {
            const isCurrentWeek = getWeekStart(new Date(), weekStartsOn).getTime() === week.getTime()
            return (
              <div
                key={i}
                className={`flex-shrink-0 px-1 flex flex-col items-center justify-center text-xs border-r border-gray-200 ${isCurrentWeek ? 'bg-indigo-100 font-medium text-indigo-700' : 'text-gray-600'}`}
                style={{ width: `${weekWidth}px` }}
              >
                <span>S{getWeekNumber(week)}</span>
                <span className="text-[10px] text-gray-400">
                  {week.getDate().toString().padStart(2, '0')}/{(week.getMonth() + 1).toString().padStart(2, '0')}
                </span>
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <div>
          {stages.map((stage) => {
            const isStageExpanded = expandedStages.has(stage.id)
            const hasNoTasks = stage.tasks.length === 0
            const isAddingTaskHere = addingTaskInStage === stage.id

            return (
              <React.Fragment key={`stage-group-${stage.id}`}>
                {/* Stage row */}
                <div
                  className="relative border-b border-indigo-200 bg-indigo-50/50"
                  style={{
                    width: `${weeksToShow * weekWidth}px`,
                    height: `${stageRowHeight}px`
                  }}
                >
                  <div className="absolute inset-0 flex items-center">
                    {renderStageBar(stage)}
                  </div>
                  {/* Week grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {weeks.map((_, i) => (
                      <div key={i} className="flex-shrink-0 border-r border-gray-100" style={{ width: `${weekWidth}px` }} />
                    ))}
                  </div>
                </div>

                {/* Content when stage is expanded */}
                {isStageExpanded && (
                  <>
                    {/* Empty stage placeholder row OR task rows */}
                    {hasNoTasks && !isAddingTaskHere ? (
                      renderEmptyRow(`empty-stage-${stage.id}`)
                    ) : (
                      renderTaskRows(stage.tasks, 0, stage.id)
                    )}

                    {/* Add task input row or button row */}
                    {isAddingTaskHere ? (
                      renderEmptyRow(`add-task-${stage.id}`, 'bg-green-50/30')
                    ) : !hasNoTasks ? (
                      renderEmptyRow(`add-task-btn-${stage.id}`)
                    ) : null}
                  </>
                )}
              </React.Fragment>
            )
          })}

          {/* Unstaged tasks header (if any) */}
          {unstagedTasks.length > 0 && (
            <>
              <div
                className="relative border-b border-gray-300 bg-gray-100"
                style={{
                  width: `${weeksToShow * weekWidth}px`,
                  height: `${stageRowHeight}px`
                }}
              >
                {/* Week grid lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {weeks.map((_, i) => (
                    <div key={i} className="flex-shrink-0 border-r border-gray-100" style={{ width: `${weekWidth}px` }} />
                  ))}
                </div>
              </div>
              {renderTaskRows(unstagedTasks)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
