'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import RichTextEditor from '@/components/RichTextEditor'

// Gantt utility functions
const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday as start of week
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const addWeeks = (date: Date, weeks: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

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

interface User {
  id: number
  username: string
  first_name: string | null
  last_name: string | null
  email: string
  user_type: string
}

interface Task {
  id: number
  task_name: string
  description: string | null
  status: string
  priority: string
  sold_days: number | null
  stage_id: number | null
  parent_task_id: number | null
  display_order: number
  start_date: string | null
  due_date: string | null
  responsible_id: number | null
  assigned_username: string | null
  assigned_first_name: string | null
  assigned_last_name: string | null
  subtasks: Task[]
}

interface Stage {
  id: number
  stage_name: string
  stage_order: number
  description: string | null
  start_date: string | null
  end_date: string | null
  task_count: number
  completed_task_count: number
  tasks: Task[]
}

interface Project {
  id: number
  project_name: string
  description: string | null
  status: string
  client_name: string
  pm_username: string
  pm_first_name: string | null
  pm_last_name: string | null
  created_at: string
  project_type_id: number | null
  project_type_name: string | null
  erp_ref: string | null
}

interface ProjectType {
  id: number
  type_name: string
  description: string | null
}

type DragType = 'stage' | 'task' | 'subtask'

interface DragItem {
  type: DragType
  id: number
  stageId: number | null
  parentTaskId: number | null
}

type EditingItem = {
  type: 'stage' | 'task'
  item: Stage | Task
} | null

export default function ProjectFollowUpPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [unstagedTasks, setUnstagedTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<User[]>([])

  // Timesheet data by task and week: { taskId: { weekStart: hours } }
  const [timesheetByTask, setTimesheetByTask] = useState<Record<number, Record<string, number>>>({})

  // Track expanded state for stages, tasks and subtasks
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())

  // Drag & drop state
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{ type: DragType; id: number; position: 'before' | 'after' } | null>(null)
  const dragNodeRef = useRef<HTMLElement | null>(null)

  // Inline creation state
  const [addingStage, setAddingStage] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [addingTaskInStage, setAddingTaskInStage] = useState<number | null>(null)
  const [addingSubtaskInTask, setAddingSubtaskInTask] = useState<number | null>(null)
  const [newTaskName, setNewTaskName] = useState('')

  // Edit panel state
  const [editingItem, setEditingItem] = useState<EditingItem>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [isSaving, setIsSaving] = useState(false)

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'stage' | 'task'; id: number; name: string } | null>(null)

  // Inline edit state for Days
  const [editingDaysTaskId, setEditingDaysTaskId] = useState<number | null>(null)
  const [editingDaysValue, setEditingDaysValue] = useState<string>('')

  // Inline edit state for Assigned
  const [editingAssignedTaskId, setEditingAssignedTaskId] = useState<number | null>(null)

  // Inline edit state for Dates
  const [editingStartDateTaskId, setEditingStartDateTaskId] = useState<number | null>(null)
  const [editingEndDateTaskId, setEditingEndDateTaskId] = useState<number | null>(null)

  // Project edit modal state
  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [projectFormData, setProjectFormData] = useState({
    project_name: '',
    description: '',
    status: '',
    project_type_id: null as number | null,
    erp_ref: ''
  })
  const [projectFormError, setProjectFormError] = useState('')
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [loadingProjectTypes, setLoadingProjectTypes] = useState(false)
  const [isProjectSaving, setIsProjectSaving] = useState(false)

  // Project delete modal state
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Gantt state
  const [ganttWeekOffset, setGanttWeekOffset] = useState(0)
  const weeksToShow = 20
  const weekWidth = 50 // pixels per week column

  // Calculate weeks array for Gantt
  const ganttWeeks = useMemo(() => {
    const today = new Date()
    const currentWeekStart = getWeekStart(today)
    const startDate = addWeeks(currentWeekStart, ganttWeekOffset)
    return Array.from({ length: weeksToShow }, (_, i) => addWeeks(startDate, i))
  }, [ganttWeekOffset])

  // Check if current week is visible
  const isCurrentWeekVisible = useMemo(() => {
    const today = new Date()
    const currentWeekStart = getWeekStart(today)
    return ganttWeeks.some(w => w.getTime() === currentWeekStart.getTime())
  }, [ganttWeeks])

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }
    fetchProjectDetails()
    fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const fetchProjectDetails = async () => {
    try {
      const { projectsAPI } = await import('@/lib/api')
      const [data, timesheetData] = await Promise.all([
        projectsAPI.getById(parseInt(projectId)),
        projectsAPI.getTimesheetSummary(parseInt(projectId))
      ])
      setProject(data.project)
      setStages(data.stages)
      setUnstagedTasks(data.unstagedTasks)
      setExpandedStages(new Set(data.stages.map((s: Stage) => s.id)))
      setTimesheetByTask(timesheetData.timesheetByTask || {})
    } catch (err: any) {
      console.error('Error fetching project:', err)
      setError(err.response?.data?.error || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { usersAPI } = await import('@/lib/api')
      const data = await usersAPI.getAll()
      setUsers(data.users)
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const toggleStage = (stageId: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(stageId)) {
        next.delete(stageId)
      } else {
        next.add(stageId)
      }
      return next
    })
  }

  const toggleTask = (taskId: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // ============================================
  // CRUD Operations
  // ============================================

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return

    try {
      const { stagesAPI } = await import('@/lib/api')
      const data = await stagesAPI.create(parseInt(projectId), { stage_name: newStageName.trim() })
      setStages(prev => [...prev, { ...data.stage, tasks: [], task_count: 0, completed_task_count: 0 }])
      setExpandedStages(prev => new Set([...prev, data.stage.id]))
      setNewStageName('')
      setAddingStage(false)
    } catch (err: any) {
      console.error('Error creating stage:', err)
    }
  }

  const handleCreateTask = async (stageId: number | null, parentTaskId: number | null = null) => {
    if (!newTaskName.trim()) return

    try {
      const { tasksAPI } = await import('@/lib/api')
      const data = await tasksAPI.create(parseInt(projectId), {
        task_name: newTaskName.trim(),
        stage_id: stageId,
        parent_task_id: parentTaskId
      })

      if (parentTaskId) {
        // Add subtask to parent task
        const addSubtaskToTask = (tasks: Task[]): Task[] => {
          return tasks.map(task => {
            if (task.id === parentTaskId) {
              return { ...task, subtasks: [...task.subtasks, data.task] }
            }
            if (task.subtasks.length > 0) {
              return { ...task, subtasks: addSubtaskToTask(task.subtasks) }
            }
            return task
          })
        }

        setStages(prev => prev.map(stage => ({
          ...stage,
          tasks: addSubtaskToTask(stage.tasks)
        })))
        setUnstagedTasks(prev => addSubtaskToTask(prev))
        setExpandedTasks(prev => new Set([...prev, parentTaskId]))
      } else if (stageId) {
        // Add task to stage
        setStages(prev => prev.map(stage => {
          if (stage.id === stageId) {
            return {
              ...stage,
              tasks: [...stage.tasks, data.task],
              task_count: stage.task_count + 1
            }
          }
          return stage
        }))
      } else {
        // Add to unstaged
        setUnstagedTasks(prev => [...prev, data.task])
      }

      setNewTaskName('')
      setAddingTaskInStage(null)
      setAddingSubtaskInTask(null)
    } catch (err: any) {
      console.error('Error creating task:', err)
    }
  }

  const handleUpdateStage = async () => {
    if (!editingItem || editingItem.type !== 'stage') return
    setIsSaving(true)

    try {
      const { stagesAPI } = await import('@/lib/api')
      const data = await stagesAPI.update(editingItem.item.id, editForm)

      setStages(prev => prev.map(stage =>
        stage.id === data.stage.id ? { ...stage, ...data.stage } : stage
      ))
      setEditingItem(null)
    } catch (err: any) {
      console.error('Error updating stage:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateTask = async () => {
    if (!editingItem || editingItem.type !== 'task') return
    setIsSaving(true)

    try {
      const { tasksAPI } = await import('@/lib/api')
      // Clean up the form data before sending
      const updateData = {
        task_name: editForm.task_name,
        description: editForm.description || null,
        priority: editForm.priority,
        status: editForm.status,
        responsible_id: editForm.responsible_id ? Number(editForm.responsible_id) : null,
        sold_days: editForm.sold_days ? Number(editForm.sold_days) : 0,
        start_date: editForm.start_date || null,
        due_date: editForm.due_date || null,
      }
      const data = await tasksAPI.update(editingItem.item.id, updateData)

      const updateTaskInList = (tasks: Task[]): Task[] => {
        return tasks.map(task => {
          if (task.id === data.task.id) {
            return { ...task, ...data.task }
          }
          if (task.subtasks.length > 0) {
            return { ...task, subtasks: updateTaskInList(task.subtasks) }
          }
          return task
        })
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: updateTaskInList(stage.tasks)
      })))
      setUnstagedTasks(prev => updateTaskInList(prev))
      setEditingItem(null)
    } catch (err: any) {
      console.error('Error updating task:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteStage = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'stage') return

    try {
      const { stagesAPI } = await import('@/lib/api')
      await stagesAPI.delete(deleteConfirm.id)
      setStages(prev => prev.filter(s => s.id !== deleteConfirm.id))
      setDeleteConfirm(null)
    } catch (err: any) {
      console.error('Error deleting stage:', err)
      alert(err.response?.data?.error || 'Failed to delete stage')
    }
  }

  const handleDeleteTask = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'task') return

    try {
      const { tasksAPI } = await import('@/lib/api')
      await tasksAPI.delete(deleteConfirm.id)

      const removeTaskFromList = (tasks: Task[]): Task[] => {
        return tasks
          .filter(task => task.id !== deleteConfirm.id)
          .map(task => ({
            ...task,
            subtasks: removeTaskFromList(task.subtasks)
          }))
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: removeTaskFromList(stage.tasks),
        task_count: stage.tasks.some(t => t.id === deleteConfirm.id) ? stage.task_count - 1 : stage.task_count
      })))
      setUnstagedTasks(prev => removeTaskFromList(prev))
      setDeleteConfirm(null)
      setEditingItem(null)
    } catch (err: any) {
      console.error('Error deleting task:', err)
    }
  }

  // Inline edit handler for Days
  const handleSaveDays = async (taskId: number) => {
    const newDays = editingDaysValue === '' ? null : parseFloat(editingDaysValue)

    try {
      const { tasksAPI } = await import('@/lib/api')
      const data = await tasksAPI.update(taskId, { sold_days: newDays || 0 })

      const updateTaskInList = (tasks: Task[]): Task[] => {
        return tasks.map(task => {
          if (task.id === data.task.id) {
            return { ...task, ...data.task }
          }
          if (task.subtasks.length > 0) {
            return { ...task, subtasks: updateTaskInList(task.subtasks) }
          }
          return task
        })
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: updateTaskInList(stage.tasks)
      })))
      setUnstagedTasks(prev => updateTaskInList(prev))
    } catch (err: any) {
      console.error('Error updating task days:', err)
    }

    setEditingDaysTaskId(null)
    setEditingDaysValue('')
  }

  const startEditingDays = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDaysTaskId(task.id)
    setEditingDaysValue(task.sold_days?.toString() || '')
  }

  // Inline edit handler for Assigned
  const handleSaveAssigned = async (taskId: number, newResponsibleId: number | null) => {
    try {
      const { tasksAPI } = await import('@/lib/api')
      const data = await tasksAPI.update(taskId, { responsible_id: newResponsibleId })

      const updateTaskInList = (tasks: Task[]): Task[] => {
        return tasks.map(task => {
          if (task.id === data.task.id) {
            return { ...task, ...data.task }
          }
          if (task.subtasks.length > 0) {
            return { ...task, subtasks: updateTaskInList(task.subtasks) }
          }
          return task
        })
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: updateTaskInList(stage.tasks)
      })))
      setUnstagedTasks(prev => updateTaskInList(prev))
    } catch (err: any) {
      console.error('Error updating task assigned:', err)
    }

    setEditingAssignedTaskId(null)
  }

  const startEditingAssigned = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingAssignedTaskId(task.id)
  }

  // Helper to find a task by id
  const findTaskById = (taskId: number): Task | undefined => {
    const searchInTasks = (tasks: Task[]): Task | undefined => {
      for (const task of tasks) {
        if (task.id === taskId) return task
        if (task.subtasks.length > 0) {
          const found = searchInTasks(task.subtasks)
          if (found) return found
        }
      }
      return undefined
    }
    for (const stage of stages) {
      const found = searchInTasks(stage.tasks)
      if (found) return found
    }
    return searchInTasks(unstagedTasks)
  }

  // Inline edit handler for Start Date
  const handleSaveStartDate = async (taskId: number, newDate: string | null) => {
    // Validate: start date must be before end date
    const task = findTaskById(taskId)
    if (task && newDate && task.due_date) {
      if (new Date(newDate) > new Date(task.due_date)) {
        alert('Start date must be before end date')
        setEditingStartDateTaskId(null)
        return
      }
    }

    try {
      const { tasksAPI } = await import('@/lib/api')
      const data = await tasksAPI.update(taskId, { start_date: newDate })

      const updateTaskInList = (tasks: Task[]): Task[] => {
        return tasks.map(task => {
          if (task.id === data.task.id) {
            return { ...task, ...data.task }
          }
          if (task.subtasks.length > 0) {
            return { ...task, subtasks: updateTaskInList(task.subtasks) }
          }
          return task
        })
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: updateTaskInList(stage.tasks)
      })))
      setUnstagedTasks(prev => updateTaskInList(prev))
    } catch (err: any) {
      console.error('Error updating task start date:', err)
    }

    setEditingStartDateTaskId(null)
  }

  // Inline edit handler for End Date
  const handleSaveEndDate = async (taskId: number, newDate: string | null) => {
    // Validate: end date must be after start date
    const task = findTaskById(taskId)
    if (task && newDate && task.start_date) {
      if (new Date(newDate) < new Date(task.start_date)) {
        alert('End date must be after start date')
        setEditingEndDateTaskId(null)
        return
      }
    }

    try {
      const { tasksAPI } = await import('@/lib/api')
      const data = await tasksAPI.update(taskId, { due_date: newDate })

      const updateTaskInList = (tasks: Task[]): Task[] => {
        return tasks.map(task => {
          if (task.id === data.task.id) {
            return { ...task, ...data.task }
          }
          if (task.subtasks.length > 0) {
            return { ...task, subtasks: updateTaskInList(task.subtasks) }
          }
          return task
        })
      }

      setStages(prev => prev.map(stage => ({
        ...stage,
        tasks: updateTaskInList(stage.tasks)
      })))
      setUnstagedTasks(prev => updateTaskInList(prev))
    } catch (err: any) {
      console.error('Error updating task end date:', err)
    }

    setEditingEndDateTaskId(null)
  }

  const formatDateForDisplay = (dateString: string | null): string => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const formatDateForInput = (dateString: string | null): string => {
    if (!dateString) return ''
    return dateString.split('T')[0]
  }

  const openEditPanel = (type: 'stage' | 'task', item: Stage | Task) => {
    setEditingItem({ type, item })
    if (type === 'stage') {
      const stage = item as Stage
      setEditForm({
        stage_name: stage.stage_name,
        description: stage.description || '',
        start_date: stage.start_date || '',
        end_date: stage.end_date || ''
      })
    } else {
      const task = item as Task
      setEditForm({
        task_name: task.task_name,
        description: task.description || '',
        priority: task.priority,
        status: task.status,
        responsible_id: task.responsible_id || '',
        sold_days: task.sold_days || 0,
        start_date: task.start_date || '',
        due_date: task.due_date || ''
      })
    }
  }

  // ============================================
  // Project Edit/Delete handlers
  // ============================================

  const openEditProjectModal = async () => {
    if (!project) return
    setProjectFormData({
      project_name: project.project_name,
      description: project.description || '',
      status: project.status,
      project_type_id: project.project_type_id,
      erp_ref: project.erp_ref || ''
    })
    setProjectFormError('')
    setShowEditProjectModal(true)

    // Fetch project types if not already loaded
    if (projectTypes.length === 0) {
      setLoadingProjectTypes(true)
      try {
        const { projectTypesAPI } = await import('@/lib/api')
        const data = await projectTypesAPI.getAll()
        setProjectTypes(data.projectTypes)
      } catch (err) {
        console.error('Error fetching project types:', err)
      } finally {
        setLoadingProjectTypes(false)
      }
    }
  }

  const handleUpdateProject = async () => {
    if (!project) return
    if (!projectFormData.project_name.trim()) {
      setProjectFormError('Project name is required')
      return
    }

    setIsProjectSaving(true)
    setProjectFormError('')

    try {
      const { projectsAPI } = await import('@/lib/api')
      const data = await projectsAPI.update(project.id, {
        project_name: projectFormData.project_name.trim(),
        description: projectFormData.description.trim() || null,
        status: projectFormData.status,
        project_type_id: projectFormData.project_type_id,
        erp_ref: projectFormData.erp_ref.trim() || null
      })

      setProject(data.project)
      setShowEditProjectModal(false)
    } catch (err: any) {
      console.error('Error updating project:', err)
      setProjectFormError(err.response?.data?.error || 'Failed to update project')
    } finally {
      setIsProjectSaving(false)
    }
  }

  const openDeleteProjectModal = () => {
    setDeletePassword('')
    setDeletePasswordError('')
    setShowDeleteProjectModal(true)
  }

  const handleDeleteProject = async () => {
    if (!project) return
    if (!deletePassword) {
      setDeletePasswordError('Password is required')
      return
    }

    setIsDeleting(true)
    setDeletePasswordError('')

    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        router.push('/login')
        return
      }
      const currentUser = JSON.parse(userStr)

      const { projectsAPI } = await import('@/lib/api')
      await projectsAPI.delete(project.id, currentUser.id, deletePassword)

      // Redirect to dashboard after successful deletion
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Error deleting project:', err)
      setDeletePasswordError(err.response?.data?.error || 'Failed to archive project')
    } finally {
      setIsDeleting(false)
    }
  }

  // ============================================
  // Drag & Drop handlers (keeping existing logic)
  // ============================================

  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    setDragItem(item)
    dragNodeRef.current = e.target as HTMLElement
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.classList.add('opacity-50')
      }
    }, 0)
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove('opacity-50')
    }
    setDragItem(null)
    setDragOverItem(null)
    dragNodeRef.current = null
  }

  const handleDragOver = (e: React.DragEvent, type: DragType, id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragItem || dragItem.id === id || dragItem.type !== type) return
    const rect = (e.target as HTMLElement).closest('tr')?.getBoundingClientRect()
    if (!rect) return
    const y = e.clientY - rect.top
    const position = y < rect.height / 2 ? 'before' : 'after'
    setDragOverItem({ type, id, position })
  }

  const handleDrop = async (e: React.DragEvent, type: DragType, targetId: number, targetStageId?: number | null) => {
    e.preventDefault()
    if (!dragItem || dragItem.type !== type) {
      setDragItem(null)
      setDragOverItem(null)
      return
    }
    try {
      if (type === 'stage') {
        await reorderStages(dragItem.id, targetId)
      } else if (type === 'task') {
        await reorderTasks(dragItem.id, targetId, dragItem.stageId, targetStageId ?? null)
      } else if (type === 'subtask') {
        await reorderSubtasks(dragItem.id, targetId, dragItem.parentTaskId!)
      }
    } catch (err) {
      console.error('Error reordering:', err)
    }
    setDragItem(null)
    setDragOverItem(null)
  }

  const reorderStages = async (draggedId: number, targetId: number) => {
    const stagesCopy = [...stages]
    const draggedIndex = stagesCopy.findIndex(s => s.id === draggedId)
    const targetIndex = stagesCopy.findIndex(s => s.id === targetId)
    if (draggedIndex === -1 || targetIndex === -1) return
    const [dragged] = stagesCopy.splice(draggedIndex, 1)
    const insertIndex = dragOverItem?.position === 'before' ? targetIndex : targetIndex + 1
    stagesCopy.splice(draggedIndex < targetIndex ? insertIndex - 1 : insertIndex, 0, dragged)
    setStages(stagesCopy)
    const { projectsAPI } = await import('@/lib/api')
    await projectsAPI.reorderStages(parseInt(projectId), stagesCopy.map(s => s.id))
  }

  const reorderTasks = async (draggedId: number, targetId: number, draggedStageId: number | null, targetStageId: number | null) => {
    if (draggedStageId === targetStageId) {
      if (draggedStageId === null) {
        const tasksCopy = [...unstagedTasks]
        const draggedIndex = tasksCopy.findIndex(t => t.id === draggedId)
        const targetIndex = tasksCopy.findIndex(t => t.id === targetId)
        if (draggedIndex === -1 || targetIndex === -1) return
        const [dragged] = tasksCopy.splice(draggedIndex, 1)
        const insertIndex = dragOverItem?.position === 'before' ? targetIndex : targetIndex + 1
        tasksCopy.splice(draggedIndex < targetIndex ? insertIndex - 1 : insertIndex, 0, dragged)
        setUnstagedTasks(tasksCopy)
        const { stagesAPI } = await import('@/lib/api')
        await stagesAPI.reorderTasks(null, tasksCopy.map(t => t.id))
      } else {
        const stagesCopy = [...stages]
        const stageIndex = stagesCopy.findIndex(s => s.id === draggedStageId)
        if (stageIndex === -1) return
        const tasksCopy = [...stagesCopy[stageIndex].tasks]
        const draggedIndex = tasksCopy.findIndex(t => t.id === draggedId)
        const targetIndex = tasksCopy.findIndex(t => t.id === targetId)
        if (draggedIndex === -1 || targetIndex === -1) return
        const [dragged] = tasksCopy.splice(draggedIndex, 1)
        const insertIndex = dragOverItem?.position === 'before' ? targetIndex : targetIndex + 1
        tasksCopy.splice(draggedIndex < targetIndex ? insertIndex - 1 : insertIndex, 0, dragged)
        stagesCopy[stageIndex] = { ...stagesCopy[stageIndex], tasks: tasksCopy }
        setStages(stagesCopy)
        const { stagesAPI } = await import('@/lib/api')
        await stagesAPI.reorderTasks(draggedStageId, tasksCopy.map(t => t.id))
      }
    } else {
      const { stagesAPI } = await import('@/lib/api')
      let draggedTask: Task | undefined
      if (draggedStageId === null) {
        draggedTask = unstagedTasks.find(t => t.id === draggedId)
      } else {
        const sourceStage = stages.find(s => s.id === draggedStageId)
        draggedTask = sourceStage?.tasks.find(t => t.id === draggedId)
      }
      if (!draggedTask) return
      let targetTasks: Task[]
      if (targetStageId === null) {
        targetTasks = [...unstagedTasks]
      } else {
        const targetStage = stages.find(s => s.id === targetStageId)
        targetTasks = targetStage ? [...targetStage.tasks] : []
      }
      const targetIndex = targetTasks.findIndex(t => t.id === targetId)
      const insertIndex = dragOverItem?.position === 'before' ? targetIndex : targetIndex + 1
      targetTasks.splice(insertIndex, 0, { ...draggedTask, stage_id: targetStageId })
      await stagesAPI.reorderTasks(targetStageId, targetTasks.map(t => t.id))
      await fetchProjectDetails()
    }
  }

  const reorderSubtasks = async (draggedId: number, targetId: number, parentTaskId: number) => {
    const findParentTask = (tasks: Task[]): Task | undefined => {
      for (const task of tasks) {
        if (task.id === parentTaskId) return task
        if (task.subtasks.length > 0) {
          const found = findParentTask(task.subtasks)
          if (found) return found
        }
      }
      return undefined
    }
    let parentTask: Task | undefined
    for (const stage of stages) {
      parentTask = findParentTask(stage.tasks)
      if (parentTask) break
    }
    if (!parentTask) {
      parentTask = findParentTask(unstagedTasks)
    }
    if (!parentTask) return
    const subtasksCopy = [...parentTask.subtasks]
    const draggedIndex = subtasksCopy.findIndex(t => t.id === draggedId)
    const targetIndex = subtasksCopy.findIndex(t => t.id === targetId)
    if (draggedIndex === -1 || targetIndex === -1) return
    const [dragged] = subtasksCopy.splice(draggedIndex, 1)
    const insertIndex = dragOverItem?.position === 'before' ? targetIndex : targetIndex + 1
    subtasksCopy.splice(draggedIndex < targetIndex ? insertIndex - 1 : insertIndex, 0, dragged)
    const updateSubtasksInStages = (stageList: Stage[]): Stage[] => {
      return stageList.map(stage => ({
        ...stage,
        tasks: updateSubtasksInTasks(stage.tasks)
      }))
    }
    const updateSubtasksInTasks = (tasks: Task[]): Task[] => {
      return tasks.map(task => {
        if (task.id === parentTaskId) {
          return { ...task, subtasks: subtasksCopy }
        }
        if (task.subtasks.length > 0) {
          return { ...task, subtasks: updateSubtasksInTasks(task.subtasks) }
        }
        return task
      })
    }
    setStages(updateSubtasksInStages(stages))
    setUnstagedTasks(updateSubtasksInTasks(unstagedTasks))
    const { tasksAPI } = await import('@/lib/api')
    await tasksAPI.reorderSubtasks(parentTaskId, subtasksCopy.map(t => t.id))
  }

  // ============================================
  // UI Helpers
  // ============================================

  // Calculate total days for a task including all subtasks recursively
  // Rule: If a task has subtasks, only subtasks' estimations count (parent's own estimation is ignored)
  const calculateTaskTotalDays = (task: Task): number => {
    if (task.subtasks && task.subtasks.length > 0) {
      // Task has subtasks: sum only subtasks' estimations
      let total = 0
      for (const subtask of task.subtasks) {
        total += calculateTaskTotalDays(subtask)
      }
      return total
    }
    // No subtasks: use the task's own estimation
    return Number(task.sold_days) || 0
  }

  // Calculate total days for a stage (all tasks and subtasks)
  const calculateStageTotalDays = (stage: Stage): number => {
    let total = 0
    for (const task of stage.tasks) {
      total += calculateTaskTotalDays(task)
    }
    return total
  }

  // Calculate total days for the entire project
  const calculateProjectTotalDays = (): number => {
    let total = 0
    for (const stage of stages) {
      total += calculateStageTotalDays(stage)
    }
    for (const task of unstagedTasks) {
      total += calculateTaskTotalDays(task)
    }
    return total
  }

  // Get earliest start date from all tasks in a stage (including subtasks)
  const getStageStartDate = (stage: Stage): string | null => {
    const dates: Date[] = []

    const checkTask = (task: Task) => {
      if (task.start_date) {
        dates.push(new Date(task.start_date))
      }
      if (task.subtasks) {
        task.subtasks.forEach(checkTask)
      }
    }

    stage.tasks.forEach(checkTask)
    if (dates.length === 0) return null
    return new Date(Math.min(...dates.map(d => d.getTime()))).toISOString()
  }

  // Get latest end date from all tasks in a stage (including subtasks)
  const getStageEndDate = (stage: Stage): string | null => {
    const dates: Date[] = []

    const checkTask = (task: Task) => {
      if (task.due_date) {
        dates.push(new Date(task.due_date))
      }
      if (task.subtasks) {
        task.subtasks.forEach(checkTask)
      }
    }

    stage.tasks.forEach(checkTask)
    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map(d => d.getTime()))).toISOString()
  }

  // Get earliest start date from a task's subtasks (for parent tasks)
  const getTaskStartDate = (task: Task): string | null => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return task.start_date
    }
    const dates: Date[] = []
    const checkSubtask = (subtask: Task) => {
      if (subtask.start_date) {
        dates.push(new Date(subtask.start_date))
      }
      if (subtask.subtasks) {
        subtask.subtasks.forEach(checkSubtask)
      }
    }
    task.subtasks.forEach(checkSubtask)
    if (dates.length === 0) return null
    return new Date(Math.min(...dates.map(d => d.getTime()))).toISOString()
  }

  // Get latest end date from a task's subtasks (for parent tasks)
  const getTaskEndDate = (task: Task): string | null => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return task.due_date
    }
    const dates: Date[] = []
    const checkSubtask = (subtask: Task) => {
      if (subtask.due_date) {
        dates.push(new Date(subtask.due_date))
      }
      if (subtask.subtasks) {
        subtask.subtasks.forEach(checkSubtask)
      }
    }
    task.subtasks.forEach(checkSubtask)
    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map(d => d.getTime()))).toISOString()
  }

  // Calculate Gantt bar position for a date range
  const calculateGanttBar = (startDate: string | null, endDate: string | null): { left: number; width: number; visible: boolean } => {
    if (!startDate && !endDate) {
      return { left: 0, width: 0, visible: false }
    }

    const firstWeekStart = ganttWeeks[0]
    const lastWeekEnd = addWeeks(ganttWeeks[ganttWeeks.length - 1], 1)

    const start = startDate ? new Date(startDate) : new Date(endDate!)
    const end = endDate ? new Date(endDate) : new Date(startDate!)

    // Check if bar is visible in current range
    if (end < firstWeekStart || start >= lastWeekEnd) {
      return { left: 0, width: 0, visible: false }
    }

    // Calculate position
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const startOffset = Math.max(0, (start.getTime() - firstWeekStart.getTime()) / msPerWeek)
    const endOffset = Math.min(weeksToShow, (end.getTime() - firstWeekStart.getTime()) / msPerWeek + 1)

    const left = startOffset * weekWidth
    const width = Math.max((endOffset - startOffset) * weekWidth - 2, 4)

    return { left, width, visible: true }
  }

  // Get consumed hours for a task in a specific week
  const getTaskWeekHours = (taskId: number, weekStart: Date): number => {
    const taskData = timesheetByTask[taskId]
    if (!taskData) return 0
    // Format the week start as YYYY-MM-DD to match backend format (local date)
    const year = weekStart.getFullYear()
    const month = String(weekStart.getMonth() + 1).padStart(2, '0')
    const day = String(weekStart.getDate()).padStart(2, '0')
    const weekKey = `${year}-${month}-${day}`
    return taskData[weekKey] || 0
  }

  // Get total consumed hours for a task (including subtasks) in a specific week
  const getTaskWeekHoursWithSubtasks = (task: Task, weekStart: Date): number => {
    let total = getTaskWeekHours(task.id, weekStart)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        total += getTaskWeekHoursWithSubtasks(subtask, weekStart)
      }
    }
    return total
  }

  // Render Gantt bar for a task
  const renderGanttBar = (task: Task, isStage: boolean = false) => {
    const startDate = isStage ? getStageStartDate(task as unknown as Stage) : getTaskStartDate(task)
    const endDate = isStage ? getStageEndDate(task as unknown as Stage) : getTaskEndDate(task)
    const { left, width, visible } = calculateGanttBar(startDate, endDate)

    if (!visible) return null

    const colorClass = isStage ? 'bg-indigo-600' : getStatusColor(task.status)

    return (
      <div
        className={`absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-opacity hover:opacity-80 ${colorClass}`}
        style={{ left: `${left}px`, width: `${width}px` }}
        onClick={(e) => {
          e.stopPropagation()
          openEditPanel(isStage ? 'stage' : 'task', task)
        }}
        title={`${isStage ? (task as unknown as Stage).stage_name : task.task_name}${startDate ? `\nStart: ${new Date(startDate).toLocaleDateString('fr-FR')}` : ''}${endDate ? `\nEnd: ${new Date(endDate).toLocaleDateString('fr-FR')}` : ''}`}
      >
        {width > 60 && (
          <span className="text-xs text-white truncate px-1 leading-5 block">
            {isStage ? (task as unknown as Stage).stage_name : task.task_name}
          </span>
        )}
      </div>
    )
  }

  // Render Gantt bar for a stage
  const renderStageGanttBar = (stage: Stage) => {
    const startDate = getStageStartDate(stage)
    const endDate = getStageEndDate(stage)
    const { left, width, visible } = calculateGanttBar(startDate, endDate)

    if (!visible) return null

    return (
      <div
        className="absolute top-1/2 -translate-y-1/2 h-6 rounded bg-indigo-600 cursor-pointer transition-opacity hover:opacity-80"
        style={{ left: `${left}px`, width: `${width}px` }}
        onClick={(e) => {
          e.stopPropagation()
          openEditPanel('stage', stage)
        }}
        title={`${stage.stage_name}${startDate ? `\nStart: ${new Date(startDate).toLocaleDateString('fr-FR')}` : ''}${endDate ? `\nEnd: ${new Date(endDate).toLocaleDateString('fr-FR')}` : ''}`}
      >
        {width > 60 && (
          <span className="text-xs text-white font-medium truncate px-1 leading-6 block">
            {stage.stage_name}
          </span>
        )}
      </div>
    )
  }

  // Format days for display (remove unnecessary decimals)
  const formatDays = (days: number): string => {
    if (days === 0) return '0'
    // If it's a whole number, show without decimals
    if (Number.isInteger(days)) {
      return days.toString()
    }
    // Otherwise show with up to 1 decimal place (e.g., 2.5)
    return days.toFixed(1).replace(/\.0$/, '')
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'todo': 'bg-gray-100 text-gray-800',
      'in_progress': 'bg-blue-100 text-blue-800',
      'review': 'bg-purple-100 text-purple-800',
      'blocked': 'bg-red-100 text-red-800',
      'done': 'bg-green-100 text-green-800',
    }
    const labels: Record<string, string> = {
      'todo': 'To Do',
      'in_progress': 'In Progress',
      'review': 'Review',
      'blocked': 'Blocked',
      'done': 'Done',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      'low': 'bg-gray-100 text-gray-600',
      'medium': 'bg-yellow-100 text-yellow-700',
      'high': 'bg-orange-100 text-orange-700',
      'urgent': 'bg-red-100 text-red-700',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[priority] || 'bg-gray-100 text-gray-600'}`}>
        {priority}
      </span>
    )
  }

  // ============================================
  // Render Functions
  // ============================================

  const renderTaskRow = (task: Task, stageId: number | null, level: number = 0, previousTaskEndDate: string | null = null): React.ReactNode[] => {
    const hasSubtasks = task.subtasks && task.subtasks.length > 0
    const isExpanded = expandedTasks.has(task.id)
    const indent = level * 20
    const isSubtask = level > 0
    const dragType: DragType = isSubtask ? 'subtask' : 'task'
    const isDragOver = dragOverItem?.type === dragType && dragOverItem.id === task.id
    const isDragging = dragItem?.type === dragType && dragItem.id === task.id

    const rows: React.ReactNode[] = []

    rows.push(
      <tr
        key={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, { type: dragType, id: task.id, stageId, parentTaskId: task.parent_task_id })}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, dragType, task.id)}
        onDrop={(e) => handleDrop(e, dragType, task.id, stageId)}
        onClick={() => openEditPanel('task', task)}
        className={`
          hover:bg-gray-50 border-b border-gray-100 cursor-pointer h-[36px]
          ${level > 0 ? 'bg-gray-50/30' : ''}
          ${isDragging ? 'opacity-50' : ''}
          ${isDragOver && dragOverItem?.position === 'before' ? 'border-t-2 border-t-indigo-500' : ''}
          ${isDragOver && dragOverItem?.position === 'after' ? 'border-b-2 border-b-indigo-500' : ''}
        `}
      >
        <td className="px-4">
          <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
            <div className="w-5 mr-1 flex-shrink-0 text-gray-300 hover:text-gray-500 cursor-grab">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
              </svg>
            </div>
            <div className="w-5 mr-2 flex-shrink-0">
              {hasSubtasks && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                  className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
                >
                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
            <div className="w-4 mr-2 flex-shrink-0">
              {level === 0 ? (
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </div>
            <span className={`text-sm truncate ${level === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}`} title={task.task_name}>
              {task.task_name}
            </span>
            {hasSubtasks && (
              <span className="ml-2 text-xs text-gray-400">({task.subtasks.length})</span>
            )}
            {/* Add subtask button - only visible on hover for top-level tasks */}
            {level === 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setAddingSubtaskInTask(task.id); setNewTaskName(''); }}
                className="ml-3 px-1.5 py-0.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded opacity-0 group-hover:opacity-100 transition-all"
                title="Add subtask"
              >
                + subtask
              </button>
            )}
          </div>
        </td>
        <td className="px-4 text-center text-sm text-gray-600">
          {hasSubtasks ? (
            <span className="text-gray-500 px-2 py-1" title="Earliest subtask start date">
              {formatDateForDisplay(getTaskStartDate(task))}
            </span>
          ) : editingStartDateTaskId === task.id ? (
            <input
              type="date"
              defaultValue={formatDateForInput(task.start_date) || formatDateForInput(previousTaskEndDate)}
              max={formatDateForInput(task.due_date) || undefined}
              onChange={(e) => {
                const newValue = e.target.value || null
                handleSaveStartDate(task.id, newValue)
              }}
              onBlur={() => setEditingStartDateTaskId(null)}
              className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => { e.stopPropagation(); setEditingStartDateTaskId(task.id); }}
              className="cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 px-2 py-1 rounded transition-colors"
              title="Click to edit"
            >
              {formatDateForDisplay(task.start_date)}
            </span>
          )}
        </td>
        <td className="px-4 text-center text-sm text-gray-600">
          {hasSubtasks ? (
            <span className="text-gray-500 px-2 py-1" title="Latest subtask end date">
              {formatDateForDisplay(getTaskEndDate(task))}
            </span>
          ) : editingEndDateTaskId === task.id ? (
            <input
              type="date"
              defaultValue={formatDateForInput(task.due_date) || formatDateForInput(task.start_date)}
              min={formatDateForInput(task.start_date) || undefined}
              onChange={(e) => {
                const newValue = e.target.value || null
                handleSaveEndDate(task.id, newValue)
              }}
              onBlur={() => setEditingEndDateTaskId(null)}
              className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => { e.stopPropagation(); setEditingEndDateTaskId(task.id); }}
              className="cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 px-2 py-1 rounded transition-colors"
              title="Click to edit"
            >
              {formatDateForDisplay(task.due_date)}
            </span>
          )}
        </td>
        <td className="px-4 text-sm text-gray-600 text-center">
          {hasSubtasks ? (
            <span className="text-gray-500 px-2 py-1" title="Sum of subtasks">
              {formatDays(calculateTaskTotalDays(task))}d
            </span>
          ) : editingDaysTaskId === task.id ? (
            <input
              type="number"
              step="0.5"
              min="0"
              value={editingDaysValue}
              onChange={(e) => setEditingDaysValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveDays(task.id)
                if (e.key === 'Escape') { setEditingDaysTaskId(null); setEditingDaysValue(''); }
              }}
              onBlur={() => handleSaveDays(task.id)}
              className="w-16 px-2 py-1 text-sm text-center border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => startEditingDays(task, e)}
              className="cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 px-2 py-1 rounded transition-colors"
              title="Click to edit"
            >
              {task.sold_days ? `${formatDays(Number(task.sold_days))}d` : '-'}
            </span>
          )}
        </td>
        <td className="px-4 text-center">{getStatusBadge(task.status)}</td>
        <td className="px-4 text-sm text-gray-600">
          {hasSubtasks ? (
            <span className="text-gray-400 px-2 py-1" title="Assigned at subtask level">
              -
            </span>
          ) : editingAssignedTaskId === task.id ? (
            <select
              value={task.responsible_id || ''}
              onChange={(e) => {
                const newValue = e.target.value ? Number(e.target.value) : null
                handleSaveAssigned(task.id, newValue)
              }}
              onBlur={() => setEditingAssignedTaskId(null)}
              className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">Unassigned</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
                </option>
              ))}
            </select>
          ) : (
            <span
              onClick={(e) => startEditingAssigned(task, e)}
              className="cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 px-2 py-1 rounded transition-colors"
              title="Click to edit"
            >
              {task.assigned_first_name ? `${task.assigned_first_name} ${task.assigned_last_name || ''}` : task.assigned_username || '-'}
            </span>
          )}
        </td>
        {/* Gantt cell */}
        <td className="p-0 relative" style={{ minWidth: `${weeksToShow * weekWidth}px` }}>
          <div className="absolute inset-0 flex">
            {ganttWeeks.map((week, i) => {
              const hours = getTaskWeekHoursWithSubtasks(task, week)
              const days = hours / 8 // Convert hours to days (assuming 8h/day)
              return (
                <div
                  key={i}
                  className="flex-shrink-0 border-r border-gray-100 flex items-end justify-center pb-0.5"
                  style={{ width: `${weekWidth}px` }}
                >
                  {hours > 0 && (
                    <span className="text-[10px] text-gray-500 font-medium" title={`${hours}h consumed`}>
                      {days % 1 === 0 ? days : days.toFixed(1)}d
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {renderGanttBar(task)}
        </td>
      </tr>
    )

    // Render subtasks
    if (hasSubtasks && isExpanded) {
      let prevSubtaskEndDate: string | null = null
      task.subtasks.forEach(subtask => {
        rows.push(...renderTaskRow(subtask, stageId, level + 1, prevSubtaskEndDate))
        prevSubtaskEndDate = subtask.due_date
      })
    }

    // Render add subtask row if adding
    if (addingSubtaskInTask === task.id) {
      rows.push(
        <tr key={`add-subtask-${task.id}`} className="bg-indigo-50/50 h-[36px]">
          <td colSpan={7} className="px-4">
            <div className="flex items-center" style={{ paddingLeft: `${(level + 1) * 20}px` }}>
              <input
                type="text"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTask(stageId, task.id)
                  if (e.key === 'Escape') { setAddingSubtaskInTask(null); setNewTaskName(''); }
                }}
                placeholder="New subtask name..."
                className="flex-1 px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button onClick={() => handleCreateTask(stageId, task.id)} className="ml-2 p-1 text-green-600 hover:text-green-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={() => { setAddingSubtaskInTask(null); setNewTaskName(''); }} className="ml-1 p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
      )
    }

    return rows
  }

  const renderStageRow = (stage: Stage, index: number) => {
    const isExpanded = expandedStages.has(stage.id)
    const completionRate = stage.task_count > 0 ? Math.round((stage.completed_task_count / stage.task_count) * 100) : 0
    const isDragOver = dragOverItem?.type === 'stage' && dragOverItem.id === stage.id
    const isDragging = dragItem?.type === 'stage' && dragItem.id === stage.id

    const rows: React.ReactNode[] = []

    rows.push(
      <tr
        key={`stage-${stage.id}`}
        draggable
        onDragStart={(e) => handleDragStart(e, { type: 'stage', id: stage.id, stageId: null, parentTaskId: null })}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, 'stage', stage.id)}
        onDrop={(e) => handleDrop(e, 'stage', stage.id)}
        className={`
          bg-indigo-50 hover:bg-indigo-100 cursor-grab border-b border-indigo-200 h-[44px]
          ${isDragging ? 'opacity-50' : ''}
          ${isDragOver && dragOverItem?.position === 'before' ? 'border-t-2 border-t-indigo-600' : ''}
          ${isDragOver && dragOverItem?.position === 'after' ? 'border-b-2 border-b-indigo-600' : ''}
        `}
      >
        <td className="px-4">
          <div className="flex items-center">
            <div className="w-5 mr-1 text-indigo-300 hover:text-indigo-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
              </svg>
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggleStage(stage.id); }} className="w-5 mr-2">
              <svg className={`w-5 h-5 text-indigo-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span
              className="font-semibold text-indigo-900 cursor-pointer hover:underline"
              onClick={(e) => { e.stopPropagation(); openEditPanel('stage', stage); }}
            >
              {stage.stage_name}
            </span>
          </div>
        </td>
        <td className="px-4 text-center text-sm text-indigo-600 font-medium">
          {formatDateForDisplay(getStageStartDate(stage))}
        </td>
        <td className="px-4 text-center text-sm text-indigo-600 font-medium">
          {formatDateForDisplay(getStageEndDate(stage))}
        </td>
        <td className="px-4 text-center">
          <span className="text-sm font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
            {formatDays(calculateStageTotalDays(stage))}d
          </span>
        </td>
        <td className="px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-indigo-700">{stage.completed_task_count}/{stage.task_count}</span>
            <div className="w-16 bg-indigo-200 rounded-full h-2">
              <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
            </div>
            <span className="text-sm font-medium text-indigo-700">{completionRate}%</span>
          </div>
        </td>
        <td className="px-4"></td>
        {/* Gantt cell */}
        <td className="p-0 relative bg-indigo-50/30" style={{ minWidth: `${weeksToShow * weekWidth}px` }}>
          <div className="absolute inset-0 flex">
            {ganttWeeks.map((_, i) => (
              <div key={i} className="flex-shrink-0 border-r border-indigo-100" style={{ width: `${weekWidth}px` }} />
            ))}
          </div>
          {renderStageGanttBar(stage)}
        </td>
      </tr>
    )

    if (isExpanded) {
      if (stage.tasks.length === 0 && addingTaskInStage !== stage.id) {
        const isDropTarget = dragItem?.type === 'task' && dragItem.stageId !== stage.id
        rows.push(
          <tr
            key={`stage-${stage.id}-empty`}
            className={`border-b border-gray-100 transition-colors h-[36px] ${isDropTarget ? 'bg-indigo-50' : ''}`}
            onDragOver={(e) => {
              if (dragItem?.type === 'task') {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            }}
            onDrop={async (e) => {
              e.preventDefault()
              if (dragItem?.type === 'task') {
                try {
                  const { stagesAPI } = await import('@/lib/api')
                  await stagesAPI.reorderTasks(stage.id, [dragItem.id])
                  await fetchProjectDetails()
                } catch (err) {
                  console.error('Error moving task to empty stage:', err)
                }
                setDragItem(null)
                setDragOverItem(null)
              }
            }}
          >
            <td colSpan={7} className={`px-4 text-left text-sm ${isDropTarget ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>
              {isDropTarget ? (
                'Drop task here'
              ) : (
                <>
                  No tasks in this stage.{' '}
                  <button
                    onClick={() => { setAddingTaskInStage(stage.id); setNewTaskName(''); }}
                    className="text-indigo-600 hover:underline"
                  >
                    Add one
                  </button>
                </>
              )}
            </td>
          </tr>
        )
      } else {
        let prevTaskEndDate: string | null = null
        stage.tasks.forEach(task => {
          rows.push(...renderTaskRow(task, stage.id, 0, prevTaskEndDate))
          prevTaskEndDate = task.due_date
        })
      }

      // Add task row
      if (addingTaskInStage === stage.id) {
        rows.push(
          <tr key={`add-task-${stage.id}`} className="bg-green-50/50 border-b border-gray-100 h-[36px]">
            <td colSpan={7} className="px-4">
              <div className="flex items-center">
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTask(stage.id)
                    if (e.key === 'Escape') { setAddingTaskInStage(null); setNewTaskName(''); }
                  }}
                  placeholder="New task name..."
                  className="flex-1 px-3 py-1.5 text-sm border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
                <button onClick={() => handleCreateTask(stage.id)} className="ml-2 p-1.5 text-green-600 hover:text-green-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button onClick={() => { setAddingTaskInStage(null); setNewTaskName(''); }} className="ml-1 p-1.5 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        )
      } else if (stage.tasks.length > 0) {
        // Add task button row
        rows.push(
          <tr key={`add-task-btn-${stage.id}`} className="border-b border-gray-200 h-[36px]">
            <td colSpan={7} className="px-4">
              <button
                onClick={() => { setAddingTaskInStage(stage.id); setNewTaskName(''); }}
                className="flex items-center text-sm text-gray-500 hover:text-indigo-600"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add task
              </button>
            </td>
          </tr>
        )
      }
    }

    return rows
  }

  // ============================================
  // Loading and Error States
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // Main Render
  // ============================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/dashboard')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project?.project_name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  <span>{project?.client_name}</span>
                  <span>-</span>
                  <span>PM: {project?.pm_first_name || project?.pm_username}</span>
                  {project?.project_type_name && (
                    <>
                      <span>-</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                        {project.project_type_name}
                      </span>
                    </>
                  )}
                  {project?.erp_ref && (
                    <>
                      <span>-</span>
                      <span className="text-gray-600">ERP: {project.erp_ref}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Total estimé</div>
                <div className="text-2xl font-bold text-indigo-600">
                  {formatDays(calculateProjectTotalDays())}j
                </div>
              </div>

              {/* Project Edit/Delete buttons */}
              <div className="flex items-center gap-2 ml-4 border-l pl-4">
                <button
                  onClick={openEditProjectModal}
                  className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                  title="Edit project"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={openDeleteProjectModal}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Archive project"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6 px-4 sm:px-6 lg:px-8">
        {project?.description && (
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <p className="text-gray-600">{project.description}</p>
          </div>
        )}

        {/* Table with integrated Gantt */}
        <div className="bg-white shadow rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              {/* Navigation row for Gantt */}
              <tr className="border-b border-gray-200">
                <th colSpan={6} className="bg-gray-100 px-4 py-2 text-left">
                  <span className="text-sm font-medium text-gray-600">Project Tasks</span>
                </th>
                <th className="bg-gray-100 px-2 py-1">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setGanttWeekOffset(prev => prev - 20)}
                      className="px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                      title="Previous 20 weeks"
                    >
                      ◀◀
                    </button>
                    <button
                      onClick={() => setGanttWeekOffset(prev => prev - 4)}
                      className="px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                      title="Previous 4 weeks"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => setGanttWeekOffset(0)}
                      className={`px-2 py-0.5 text-xs border rounded ${isCurrentWeekVisible ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
                      title="Go to current week"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setGanttWeekOffset(prev => prev + 4)}
                      className="px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                      title="Next 4 weeks"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => setGanttWeekOffset(prev => prev + 20)}
                      className="px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                      title="Next 20 weeks"
                    >
                      ▶▶
                    </button>
                  </div>
                </th>
              </tr>
              {/* Column headers */}
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workload</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Start</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">End</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Estimated</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Assigned</th>
                {/* Gantt week headers */}
                <th className="p-0" style={{ minWidth: `${weeksToShow * weekWidth}px` }}>
                  <div className="flex">
                    {ganttWeeks.map((week, i) => {
                      const isCurrentWeek = getWeekStart(new Date()).getTime() === week.getTime()
                      return (
                        <div
                          key={i}
                          className={`flex-shrink-0 px-1 py-1 text-center text-xs border-r border-gray-200 ${isCurrentWeek ? 'bg-indigo-100 font-medium text-indigo-700' : 'text-gray-600'}`}
                          style={{ width: `${weekWidth}px` }}
                        >
                          <div>S{getWeekNumber(week)}</div>
                          <div className="text-[9px] text-gray-400">
                            {week.getDate().toString().padStart(2, '0')}/{(week.getMonth() + 1).toString().padStart(2, '0')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr]:group">
              {stages.map((stage, index) => renderStageRow(stage, index))}

              {/* Add Stage Row */}
              {addingStage ? (
                <tr className="bg-indigo-50/50 border-b border-indigo-200">
                  <td colSpan={7} className="py-3 px-4">
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateStage()
                          if (e.key === 'Escape') { setAddingStage(false); setNewStageName(''); }
                        }}
                        placeholder="New stage name..."
                        className="flex-1 px-3 py-2 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <button onClick={handleCreateStage} className="ml-2 p-2 text-green-600 hover:text-green-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button onClick={() => { setAddingStage(false); setNewStageName(''); }} className="ml-1 p-2 text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td colSpan={7} className="py-3 px-4">
                    <button
                      onClick={() => setAddingStage(true)}
                      className="flex items-center text-sm text-gray-500 hover:text-indigo-600"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Stage
                    </button>
                  </td>
                </tr>
              )}

              {/* Unstaged tasks */}
              {unstagedTasks.length > 0 && (
                <>
                  <tr className="bg-gray-100 border-b border-gray-200 border-t-2">
                    <td colSpan={7} className="py-3 px-4">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-gray-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <span className="font-semibold text-gray-700">Unstaged Tasks</span>
                        <span className="ml-2 text-sm text-gray-500">({unstagedTasks.length})</span>
                      </div>
                    </td>
                  </tr>
                  {unstagedTasks.map((task, index) => renderTaskRow(task, null, 0, index > 0 ? unstagedTasks[index - 1].due_date : null))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Edit Panel (Slide-out) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-25" onClick={() => setEditingItem(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
            <div className="flex flex-col h-full">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingItem.type === 'stage' ? 'Edit Stage' : 'Edit Task'}
                </h3>
                <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {editingItem.type === 'stage' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stage Name</label>
                      <input
                        type="text"
                        value={editForm.stage_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, stage_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={editForm.start_date || ''}
                          onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input
                          type="date"
                          value={editForm.end_date || ''}
                          onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                      <input
                        type="text"
                        value={editForm.task_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, task_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <RichTextEditor
                        value={editForm.description || ''}
                        onChange={(value) => setEditForm({ ...editForm, description: value })}
                        placeholder="Enter task description..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                          value={editForm.status || 'todo'}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="review">Review</option>
                          <option value="blocked">Blocked</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <select
                          value={editForm.priority || 'medium'}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                      <select
                        value={editForm.responsible_id || ''}
                        onChange={(e) => setEditForm({ ...editForm, responsible_id: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Unassigned</option>
                        {users.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sold Days</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editForm.sold_days || 0}
                        onChange={(e) => setEditForm({ ...editForm, sold_days: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={editForm.start_date || ''}
                          onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                          type="date"
                          value={editForm.due_date || ''}
                          onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm({
                      type: editingItem.type,
                      id: editingItem.item.id,
                      name: editingItem.type === 'stage'
                        ? (editingItem.item as Stage).stage_name
                        : (editingItem.item as Task).task_name
                    })}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingItem.type === 'stage' ? handleUpdateStage : handleUpdateTask}
                    disabled={isSaving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete {deleteConfirm.type}?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "{deleteConfirm.name}"?
              {deleteConfirm.type === 'task' && ' This will also delete all subtasks.'}
              {deleteConfirm.type === 'stage' && ' The stage must be empty first.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteConfirm.type === 'stage' ? handleDeleteStage : handleDeleteTask}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Project
              </h3>
              <button
                onClick={() => setShowEditProjectModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {projectFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {projectFormError}
                </div>
              )}

              <div>
                <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  id="project_name"
                  value={projectFormData.project_name}
                  onChange={(e) => setProjectFormData(prev => ({ ...prev, project_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Project name"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={projectFormData.description}
                  onChange={(e) => setProjectFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Project description"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  value={projectFormData.status}
                  onChange={(e) => setProjectFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="created">Created</option>
                  <option value="in_progress">In Progress</option>
                  <option value="frozen">Frozen</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label htmlFor="project_type" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Type
                </label>
                <select
                  id="project_type"
                  value={projectFormData.project_type_id ?? ''}
                  onChange={(e) => setProjectFormData(prev => ({
                    ...prev,
                    project_type_id: e.target.value ? parseInt(e.target.value) : null
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loadingProjectTypes}
                >
                  <option value="">No type selected</option>
                  {projectTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.type_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="erp_ref" className="block text-sm font-medium text-gray-700 mb-1">
                  ERP Ref.
                </label>
                <input
                  type="text"
                  id="erp_ref"
                  value={projectFormData.erp_ref}
                  onChange={(e) => setProjectFormData(prev => ({ ...prev, erp_ref: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="ERP reference"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProjectModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateProject}
                  disabled={isProjectSaving}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isProjectSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Modal with Password Confirmation */}
      {showDeleteProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Archive Project</h3>
                <p className="text-sm text-gray-500">This action requires confirmation</p>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              Are you sure you want to archive the project{' '}
              <span className="font-semibold">{project?.project_name}</span>?
              The project will be hidden but can be restored by an administrator.
            </p>

            <div className="mb-4">
              <label htmlFor="delete_password" className="block text-sm font-medium text-gray-700 mb-1">
                Enter your password to confirm
              </label>
              <input
                type="password"
                id="delete_password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Your password"
              />
              {deletePasswordError && (
                <p className="mt-1 text-sm text-red-600">{deletePasswordError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteProjectModal(false); setDeletePassword(''); setDeletePasswordError(''); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting || !deletePassword}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
