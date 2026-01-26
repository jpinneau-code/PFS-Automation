'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  username: string
  first_name: string | null
  last_name: string | null
  email: string
  user_type: string
  daily_work_hours?: number
}

interface TimesheetTask {
  id: number
  name: string
  stage_id: number | null
  stage_name: string | null
  sold_days: number  // Estimated days for the task
  remaining_hours: number | null
  last_remaining_update_total: number | null  // Total hours when remaining was last updated
  total_hours: number  // Current total hours from all timesheet entries
}

interface TimesheetProject {
  id: number
  name: string
  status: string
  tasks: TimesheetTask[]
}

interface TimesheetEntry {
  id: number
  task_id: number
  date: string
  hours: number
  description: string | null
  entered_by: number
  entered_by_username: string
}

interface TimesheetLock {
  project_id: number | null
  year: number
  month: number
  locked_by: number
  locked_at: string
}

type ViewMode = 'month' | 'week' | 'day'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function TimesheetPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Data state
  const [projects, setProjects] = useState<TimesheetProject[]>([])
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [locks, setLocks] = useState<TimesheetLock[]>([])

  // User selection (for PM/Admin)
  const [viewableUsers, setViewableUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  // Edit state
  const [editingCell, setEditingCell] = useState<{ taskId: number; date: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Inline remaining hours editing
  const [editingRemaining, setEditingRemaining] = useState<number | null>(null)
  const [remainingEditValue, setRemainingEditValue] = useState('')
  const [remainingDisplayUnit, setRemainingDisplayUnit] = useState<'hours' | 'days'>('hours')

  // Expanded projects
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())

  // Ref for scroll container
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // List of visible task IDs for vertical navigation
  const visibleTaskIds = useMemo(() => {
    const ids: number[] = []
    projects.forEach(project => {
      if (expandedProjects.has(project.id)) {
        project.tasks.forEach(task => {
          ids.push(task.id)
        })
      }
    })
    return ids
  }, [projects, expandedProjects])

  // Get project ID for a task
  const getProjectIdForTask = useCallback((taskId: number): number | null => {
    for (const project of projects) {
      if (project.tasks.some(t => t.id === taskId)) {
        return project.id
      }
    }
    return null
  }, [projects])

  // Get days for current view
  const viewDays = useMemo(() => {
    const days: Date[] = []
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    if (viewMode === 'month') {
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i))
      }
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate)
      const day = startOfWeek.getDay()
      const diff = day === 0 ? -6 : 1 - day // Start on Monday
      startOfWeek.setDate(startOfWeek.getDate() + diff)
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek)
        d.setDate(d.getDate() + i)
        days.push(d)
      }
    } else {
      days.push(new Date(currentDate))
    }

    return days
  }, [currentDate, viewMode])

  // Format date for API (using local date to avoid timezone issues)
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Parse hours input (supports HH:MM format)
  const parseHoursInput = (input: string): number => {
    if (input.includes(':')) {
      const [hours, minutes] = input.split(':').map(Number)
      return hours + (minutes || 0) / 60
    }
    return parseFloat(input) || 0
  }

  // Format hours for display
  const formatHours = (hours: number): string => {
    if (hours === 0) return ''
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (m === 0) return `${h}:00`
    return `${h}:${m.toString().padStart(2, '0')}`
  }

  // Check if date is locked
  const isDateLocked = useCallback((date: Date, projectId: number): boolean => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    return locks.some(lock =>
      lock.year === year &&
      lock.month === month &&
      (lock.project_id === null || lock.project_id === projectId)
    )
  }, [locks])

  // Normalize entry date (handles both ISO and YYYY-MM-DD formats)
  const normalizeEntryDate = (dateStr: string): string => {
    if (dateStr.includes('T')) {
      // ISO format - extract date part from the UTC date
      const d = new Date(dateStr)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
    return dateStr
  }

  // Get entry for a task and date
  const getEntry = useCallback((taskId: number, date: Date): TimesheetEntry | undefined => {
    const dateStr = formatDateForAPI(date)
    return entries.find(e => e.task_id === taskId && normalizeEntryDate(e.date) === dateStr)
  }, [entries])

  // Calculate total hours for a task
  const getTaskTotal = useCallback((taskId: number): number => {
    return entries
      .filter(e => e.task_id === taskId)
      .reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0)
  }, [entries])

  // Calculate total hours for a day
  const getDayTotal = useCallback((date: Date): number => {
    const dateStr = formatDateForAPI(date)
    return entries
      .filter(e => normalizeEntryDate(e.date) === dateStr)
      .reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0)
  }, [entries])

  // Calculate grand total
  const grandTotal = useMemo(() => {
    return entries.reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0)
  }, [entries])

  // Get daily work hours for selected user
  const getSelectedUserDailyHours = useCallback((): number => {
    if (!selectedUserId) return 8
    const selectedUser = viewableUsers.find(u => u.id === selectedUserId)
    return selectedUser?.daily_work_hours || 8
  }, [selectedUserId, viewableUsers])

  // Check if remaining hours is stale (total has changed since last update)
  const isRemainingStale = (task: TimesheetTask): boolean => {
    if (task.remaining_hours === null) return false
    if (task.last_remaining_update_total === null) return true
    return Math.abs(task.total_hours - task.last_remaining_update_total) > 0.01
  }

  // Format remaining hours for display (supports hours or days)
  const formatRemaining = useCallback((hours: number | null): string => {
    if (hours === null) return '-'

    if (remainingDisplayUnit === 'days') {
      const dailyHours = getSelectedUserDailyHours()
      const days = hours / dailyHours
      // Round to 2 decimal places
      const rounded = Math.round(days * 100) / 100
      return `${rounded}d`
    }

    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (m === 0) return `${h}h`
    return `${h}h${m.toString().padStart(2, '0')}`
  }, [remainingDisplayUnit, getSelectedUserDailyHours])

  // Load user settings
  const loadUserSettings = async (userId: number) => {
    try {
      const { userSettingsAPI } = await import('@/lib/api')
      const data = await userSettingsAPI.getAll(userId)
      if (data.settings.remaining_display_unit) {
        setRemainingDisplayUnit(data.settings.remaining_display_unit as 'hours' | 'days')
      }
    } catch (err) {
      console.error('Error loading user settings:', err)
    }
  }

  // Save remaining display unit preference
  const saveRemainingDisplayUnit = async (unit: 'hours' | 'days') => {
    if (!user) return
    try {
      const { userSettingsAPI } = await import('@/lib/api')
      await userSettingsAPI.update(user.id, 'remaining_display_unit', unit)
    } catch (err) {
      console.error('Error saving remaining display unit:', err)
    }
  }

  // Toggle remaining display unit
  const toggleRemainingDisplayUnit = () => {
    const newUnit = remainingDisplayUnit === 'hours' ? 'days' : 'hours'
    setRemainingDisplayUnit(newUnit)
    saveRemainingDisplayUnit(newUnit)
  }

  // Load user and initial data
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      setUser(userData)
      setSelectedUserId(userData.id)
      setExpandedProjects(new Set()) // Will be filled after loading projects
      loadViewableUsers(userData.id)
      loadUserSettings(userData.id)
    } catch (err) {
      console.error('Error parsing user data:', err)
      router.push('/login')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load timesheet data when user or date changes
  useEffect(() => {
    if (user && selectedUserId) {
      loadTimesheetData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedUserId, currentDate, viewMode])

  const loadViewableUsers = async (userId: number) => {
    try {
      const { timesheetAPI } = await import('@/lib/api')
      const data = await timesheetAPI.getViewableUsers(userId)
      setViewableUsers(data.users)
    } catch (err) {
      console.error('Error loading viewable users:', err)
    }
  }

  const loadTimesheetData = async () => {
    if (!user || !selectedUserId) return

    setLoading(true)
    try {
      const { timesheetAPI } = await import('@/lib/api')
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1

      const data = await timesheetAPI.getData(
        user.id,
        year,
        month,
        selectedUserId !== user.id ? selectedUserId : undefined
      )

      setProjects(data.projects)
      setEntries(data.entries)
      setLocks(data.locks)

      // Expand all projects by default
      setExpandedProjects(new Set(data.projects.map((p: TimesheetProject) => p.id)))
    } catch (err: any) {
      console.error('Error loading timesheet:', err)
      setError(err.response?.data?.error || 'Failed to load timesheet')
    } finally {
      setLoading(false)
    }
  }

  // Save entry with optimistic update (no full reload to preserve scroll position)
  const saveEntryOptimistic = async (taskId: number, date: Date, hours: number): Promise<boolean> => {
    if (!user || !selectedUserId) return false

    const dateStr = formatDateForAPI(date)

    // Optimistic update of local state
    setEntries(prevEntries => {
      const existingIndex = prevEntries.findIndex(
        e => e.task_id === taskId && normalizeEntryDate(e.date) === dateStr
      )

      if (hours === 0) {
        // Remove entry if hours = 0
        if (existingIndex >= 0) {
          return prevEntries.filter((_, i) => i !== existingIndex)
        }
        return prevEntries
      }

      if (existingIndex >= 0) {
        // Update existing entry
        const updated = [...prevEntries]
        updated[existingIndex] = {
          ...updated[existingIndex],
          hours
        }
        return updated
      } else {
        // Create new entry (with temporary negative id)
        return [
          ...prevEntries,
          {
            id: -Date.now(),
            task_id: taskId,
            date: dateStr,
            hours,
            description: null,
            entered_by: user.id,
            entered_by_username: user.username
          }
        ]
      }
    })

    // Also update task total_hours for Gap calculation
    setProjects(prevProjects => {
      return prevProjects.map(project => ({
        ...project,
        tasks: project.tasks.map(task => {
          if (task.id === taskId) {
            // Calculate new total based on entries
            const otherEntriesTotal = entries
              .filter(e => e.task_id === taskId && normalizeEntryDate(e.date) !== dateStr)
              .reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0)
            return {
              ...task,
              total_hours: otherEntriesTotal + hours
            }
          }
          return task
        })
      }))
    })

    try {
      const { timesheetAPI } = await import('@/lib/api')
      const result = await timesheetAPI.saveEntry({
        user_id: selectedUserId,
        task_id: taskId,
        date: dateStr,
        hours,
        entered_by: user.id
      })

      // Update entry with real ID if it was a new entry
      if (result.entry) {
        setEntries(prevEntries =>
          prevEntries.map(e =>
            e.task_id === taskId && normalizeEntryDate(e.date) === dateStr
              ? { ...e, id: result.entry.id }
              : e
          )
        )
      }

      return true
    } catch (err: any) {
      console.error('Error saving entry:', err)
      // On error, reload to get the real state
      await loadTimesheetData()
      alert(err.response?.data?.error || 'Failed to save entry')
      return false
    }
  }

  // Save entry (legacy - with full reload)
  const saveEntry = async (taskId: number, date: Date, hours: number) => {
    if (!user || !selectedUserId) return

    try {
      const { timesheetAPI } = await import('@/lib/api')
      await timesheetAPI.saveEntry({
        user_id: selectedUserId,
        task_id: taskId,
        date: formatDateForAPI(date),
        hours,
        entered_by: user.id
      })

      // Reload data
      await loadTimesheetData()
    } catch (err: any) {
      console.error('Error saving entry:', err)
      alert(err.response?.data?.error || 'Failed to save entry')
    }
  }

  // Handle inline remaining edit
  const handleRemainingClick = (task: TimesheetTask) => {
    setEditingRemaining(task.id)
    // Convert hours to the current display unit for editing
    if (task.remaining_hours !== null) {
      if (remainingDisplayUnit === 'days') {
        const dailyHours = getSelectedUserDailyHours()
        const days = task.remaining_hours / dailyHours
        setRemainingEditValue((Math.round(days * 100) / 100).toString())
      } else {
        setRemainingEditValue(task.remaining_hours.toString())
      }
    } else {
      setRemainingEditValue('')
    }
  }

  const handleRemainingSave = async () => {
    if (!editingRemaining || !user) return

    try {
      const { timesheetAPI } = await import('@/lib/api')
      let hours = parseHoursInput(remainingEditValue)

      // Convert days to hours if display unit is days
      if (remainingDisplayUnit === 'days') {
        const dailyHours = getSelectedUserDailyHours()
        hours = hours * dailyHours
      }

      await timesheetAPI.updateRemainingHours(editingRemaining, hours, user.id)
      setEditingRemaining(null)
      setRemainingEditValue('')
      await loadTimesheetData()
    } catch (err: any) {
      console.error('Error saving remaining hours:', err)
      alert(err.response?.data?.error || 'Failed to save remaining hours')
    }
  }

  const handleRemainingKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRemainingSave()
    } else if (e.key === 'Escape') {
      setEditingRemaining(null)
      setRemainingEditValue('')
    }
  }

  // Handle cell edit
  const handleCellClick = (taskId: number, date: Date, projectId: number) => {
    if (isDateLocked(date, projectId)) return

    const entry = getEntry(taskId, date)
    setEditingCell({ taskId, date: formatDateForAPI(date) })
    setEditValue(entry ? formatHours(parseFloat(entry.hours.toString())) : '')
  }

  const handleCellBlur = async () => {
    if (!editingCell) return

    const hours = parseHoursInput(editValue)
    // Parse date string "YYYY-MM-DD" to local date to avoid timezone issues
    const [year, month, day] = editingCell.date.split('-').map(Number)
    const date = new Date(year, month - 1, day)

    // Use optimistic update to preserve scroll position
    await saveEntryOptimistic(editingCell.taskId, date, hours)
    setEditingCell(null)
    setEditValue('')
  }

  const handleCellKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    } else if (e.key === 'Tab') {
      // Move to next cell
      handleCellBlur()
    } else if (e.key === 'ArrowDown' && editingCell) {
      e.preventDefault()

      // Find the next task in the visible list
      const currentIndex = visibleTaskIds.indexOf(editingCell.taskId)
      if (currentIndex >= 0 && currentIndex < visibleTaskIds.length - 1) {
        const nextTaskId = visibleTaskIds[currentIndex + 1]
        const nextProjectId = getProjectIdForTask(nextTaskId)

        // Save current cell first (optimistic)
        const hours = parseHoursInput(editValue)
        const [year, month, day] = editingCell.date.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        await saveEntryOptimistic(editingCell.taskId, date, hours)

        // Check if next cell is locked
        if (nextProjectId && !isDateLocked(date, nextProjectId)) {
          // Activate editing on the next cell (same date column)
          const nextEntry = getEntry(nextTaskId, date)
          setEditingCell({ taskId: nextTaskId, date: editingCell.date })
          setEditValue(nextEntry ? formatHours(parseFloat(nextEntry.hours.toString())) : '')
        } else {
          // Next cell is locked, just finish editing
          setEditingCell(null)
          setEditValue('')
        }
      } else {
        // No next task, just save and finish
        handleCellBlur()
      }
    }
  }

  // Handle keyboard navigation for horizontal scroll
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't intercept if we're editing a cell
    if (editingCell || editingRemaining) return

    const container = tableContainerRef.current
    if (!container) return

    const SCROLL_AMOUNT = 100 // pixels per key press

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      container.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      container.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' })
    }
  }, [editingCell, editingRemaining])

  // Navigation
  const navigate = (direction: number) => {
    const newDate = new Date(currentDate)
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + direction)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + direction * 7)
    } else {
      newDate.setDate(newDate.getDate() + direction)
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Toggle project expansion
  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  // Check if a day is today
  const isToday = (date: Date): boolean => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  // Check if a day is weekend
  const isWeekend = (date: Date): boolean => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Timesheet</h1>
            </div>

            {/* User selector for PM/Admin */}
            {viewableUsers.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">User:</label>
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {viewableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name && u.last_name
                        ? `${u.first_name} ${u.last_name}`
                        : u.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Total */}
            <div className="text-right">
              <div className="text-sm text-gray-500">Total</div>
              <div className="text-lg font-bold text-indigo-600">{formatHours(grandTotal)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="text-lg font-medium text-gray-900 ml-2">
              {viewMode === 'month' && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              {viewMode === 'week' && `Week of ${viewDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              {viewMode === 'day' && currentDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 text-sm rounded ${viewMode === 'day' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm rounded ${viewMode === 'week' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-sm rounded ${viewMode === 'month' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Timesheet grid */}
      <div
        ref={tableContainerRef}
        className="overflow-x-auto outline-none"
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-50 border-b border-r border-gray-200 px-4 py-2 text-left text-sm font-medium text-gray-700 w-[250px] min-w-[250px]">
                Project / Task
              </th>
              <th className="sticky left-[250px] z-20 bg-gray-50 border-b border-r border-gray-200 px-2 py-2 text-center text-sm font-medium text-gray-700 w-[60px] min-w-[60px]">
                Est.
              </th>
              <th className="sticky left-[310px] z-20 bg-gray-50 border-b border-r border-gray-200 px-2 py-2 text-center text-sm font-medium text-gray-700 w-[60px] min-w-[60px]">
                Spent
              </th>
              <th className="sticky left-[370px] z-20 bg-gray-50 border-b border-r border-gray-200 px-2 py-2 text-center text-sm font-medium text-gray-700 w-[60px] min-w-[60px]">
                Gap
              </th>
              <th
                className="sticky left-[430px] z-20 bg-gray-50 border-b border-r-2 border-r-gray-400 px-2 py-2 text-center text-sm font-medium text-gray-700 w-[80px] min-w-[80px] cursor-pointer hover:bg-gray-100 select-none"
                onClick={toggleRemainingDisplayUnit}
                title="Click to toggle between hours and days"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Rem.</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${remainingDisplayUnit === 'hours' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                    {remainingDisplayUnit === 'hours' ? 'h' : 'd'}
                  </span>
                </div>
              </th>
              {viewDays.map((day, i) => (
                <th
                  key={i}
                  className={`border-b border-r border-gray-200 px-1 py-2 text-center text-xs font-medium min-w-[50px] ${
                    isToday(day) ? 'bg-indigo-100 text-indigo-700' : isWeekend(day) ? 'bg-gray-100 text-gray-500' : 'text-gray-600'
                  }`}
                >
                  <div>{DAY_NAMES[day.getDay()]}</div>
                  <div className="font-bold">{day.getDate()}</div>
                </th>
              ))}
              <th className="sticky right-0 z-20 bg-gray-50 border-b border-l border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 min-w-[70px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={viewDays.length + 6} className="py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                    Loading...
                  </div>
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={viewDays.length + 6} className="py-8 text-center text-gray-500">
                  No assigned tasks
                </td>
              </tr>
            ) : (
              <>
                {projects.map(project => (
                  <React.Fragment key={project.id}>
                    {/* Project row */}
                    <tr className="bg-indigo-50/50 hover:bg-indigo-50">
                      <td
                        className="sticky left-0 z-10 bg-indigo-50/50 hover:bg-indigo-50 border-b border-r border-gray-200 px-4 py-2 cursor-pointer w-[250px] min-w-[250px]"
                        onClick={() => toggleProject(project.id)}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${expandedProjects.has(project.id) ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-medium text-indigo-700">{project.name}</span>
                          <span className="text-xs text-gray-500">({project.tasks.length})</span>
                        </div>
                      </td>
                      {/* Empty estimated cell for project row */}
                      <td className="sticky left-[250px] z-10 bg-indigo-50/50 border-b border-r border-gray-200 px-2 py-2 w-[60px] min-w-[60px]"></td>
                      {/* Empty spent cell for project row */}
                      <td className="sticky left-[310px] z-10 bg-indigo-50/50 border-b border-r border-gray-200 px-2 py-2 w-[60px] min-w-[60px]"></td>
                      {/* Empty gap cell for project row */}
                      <td className="sticky left-[370px] z-10 bg-indigo-50/50 border-b border-r border-gray-200 px-2 py-2 w-[60px] min-w-[60px]"></td>
                      {/* Empty remaining cell for project row */}
                      <td className="sticky left-[430px] z-10 bg-indigo-50/50 border-b border-r-2 border-r-gray-400 px-2 py-2 w-[80px] min-w-[80px]"></td>
                      {viewDays.map((day, i) => (
                        <td
                          key={i}
                          className={`border-b border-r border-gray-200 px-1 py-2 text-center text-xs min-w-[50px] ${
                            isToday(day) ? 'bg-indigo-50' : isWeekend(day) ? 'bg-gray-50' : 'bg-indigo-50/30'
                          }`}
                        >
                          {/* Project row cells are empty */}
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 bg-indigo-50/50 border-b border-l border-gray-200 px-3 py-2 text-center text-sm font-medium text-indigo-600">
                        {formatHours(
                          project.tasks.reduce((sum, task) => sum + getTaskTotal(task.id), 0)
                        )}
                      </td>
                    </tr>

                    {/* Task rows */}
                    {expandedProjects.has(project.id) && project.tasks.map(task => {
                      const stale = isRemainingStale(task)
                      return (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 border-b border-r border-gray-200 px-4 py-1.5 w-[250px] min-w-[250px]">
                          <div className="flex items-center gap-2 pl-6">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span className="text-sm text-gray-700">{task.name}</span>
                            {task.stage_name && (
                              <span className="text-xs text-gray-400">({task.stage_name})</span>
                            )}
                          </div>
                        </td>
                        {/* Estimated column */}
                        <td className="sticky left-[250px] z-10 bg-white border-b border-r border-gray-200 px-1 py-0.5 text-center w-[60px] min-w-[60px]">
                          <span className="text-xs text-gray-600">
                            {task.sold_days > 0 ? `${task.sold_days}d` : '-'}
                          </span>
                        </td>
                        {/* Spent column - total hours converted to days */}
                        <td className="sticky left-[310px] z-10 bg-white border-b border-r border-gray-200 px-1 py-0.5 text-center w-[60px] min-w-[60px]">
                          <span className="text-xs text-gray-600">
                            {task.total_hours > 0 ? `${Math.round((task.total_hours / getSelectedUserDailyHours()) * 100) / 100}d` : '-'}
                          </span>
                        </td>
                        {/* Gap column - (1 - ((Spent + Rem) / Est)) as percentage */}
                        <td className="sticky left-[370px] z-10 bg-white border-b border-r border-gray-200 px-1 py-0.5 text-center w-[60px] min-w-[60px]">
                          {(() => {
                            const estDays = task.sold_days
                            const spentDays = task.total_hours / getSelectedUserDailyHours()
                            const remDays = (task.remaining_hours || 0) / getSelectedUserDailyHours()

                            if (estDays <= 0) return <span className="text-xs text-gray-400">-</span>

                            const gap = (1 - ((spentDays + remDays) / estDays)) * 100
                            const rounded = Math.round(gap)

                            // Color based on gap value: green if > 0 (under budget), red if < 0 (over budget), orange if 0
                            const colorClass = rounded > 0
                              ? 'text-green-600'
                              : rounded < 0
                                ? 'text-red-600'
                                : 'text-orange-500'

                            return (
                              <span className={`text-xs font-medium ${colorClass}`}>
                                {rounded > 0 ? '+' : ''}{rounded}%
                              </span>
                            )
                          })()}
                        </td>
                        {/* Remaining column */}
                        <td
                          className={`sticky left-[430px] z-10 border-b border-r-2 border-r-gray-400 px-1 py-0.5 text-center cursor-pointer hover:bg-blue-50 w-[80px] min-w-[80px] ${
                            stale ? 'bg-red-100' : 'bg-white'
                          }`}
                          onClick={() => handleRemainingClick(task)}
                        >
                          {editingRemaining === task.id ? (
                            <input
                              type="text"
                              value={remainingEditValue}
                              onChange={(e) => setRemainingEditValue(e.target.value)}
                              onBlur={handleRemainingSave}
                              onKeyDown={handleRemainingKeyDown}
                              className="w-full h-full px-1 py-0.5 text-xs text-center border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder={remainingDisplayUnit === 'hours' ? '0h' : '0d'}
                              autoFocus
                            />
                          ) : (
                            <span className={`text-xs ${stale ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                              {formatRemaining(task.remaining_hours)}
                            </span>
                          )}
                        </td>
                        {viewDays.map((day, i) => {
                          const entry = getEntry(task.id, day)
                          const isLocked = isDateLocked(day, project.id)
                          const isEditing = editingCell?.taskId === task.id && editingCell?.date === formatDateForAPI(day)

                          return (
                            <td
                              key={i}
                              className={`border-b border-r border-gray-200 px-0.5 py-0.5 text-center min-w-[50px] ${
                                isToday(day) ? 'bg-indigo-50/50' : isWeekend(day) ? 'bg-gray-50' : ''
                              } ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'}`}
                              onClick={() => !isEditing && handleCellClick(task.id, day, project.id)}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={handleCellBlur}
                                  onKeyDown={handleCellKeyDown}
                                  className="w-full h-full px-1 py-0.5 text-xs text-center border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  placeholder="0:00"
                                  autoFocus
                                />
                              ) : entry && parseFloat(entry.hours.toString()) > 0 ? (
                                <span className={`text-xs ${isLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                                  {formatHours(parseFloat(entry.hours.toString()))}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="sticky right-0 z-10 bg-white border-b border-l border-gray-200 px-3 py-1.5 text-center text-sm font-medium text-gray-700">
                          {formatHours(getTaskTotal(task.id))}
                        </td>
                      </tr>
                    )})}
                  </React.Fragment>
                ))}

                {/* Day totals row */}
                <tr className="bg-gray-100 font-medium">
                  <td className="sticky left-0 z-10 bg-gray-100 border-t-2 border-r border-gray-300 px-4 py-2 text-sm text-gray-700 w-[250px] min-w-[250px]">
                    Daily total
                  </td>
                  {/* Empty estimated cell for totals row */}
                  <td className="sticky left-[250px] z-10 bg-gray-100 border-t-2 border-r border-gray-300 px-2 py-2 w-[60px] min-w-[60px]"></td>
                  {/* Empty spent cell for totals row */}
                  <td className="sticky left-[310px] z-10 bg-gray-100 border-t-2 border-r border-gray-300 px-2 py-2 w-[60px] min-w-[60px]"></td>
                  {/* Empty gap cell for totals row */}
                  <td className="sticky left-[370px] z-10 bg-gray-100 border-t-2 border-r border-gray-300 px-2 py-2 w-[60px] min-w-[60px]"></td>
                  {/* Empty remaining cell for totals row */}
                  <td className="sticky left-[430px] z-10 bg-gray-100 border-t-2 border-r-2 border-r-gray-400 px-2 py-2 w-[80px] min-w-[80px]"></td>
                  {viewDays.map((day, i) => (
                    <td
                      key={i}
                      className={`border-t-2 border-r border-gray-300 px-1 py-2 text-center text-xs font-bold min-w-[50px] ${
                        isToday(day) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
                      }`}
                    >
                      {formatHours(getDayTotal(day)) || '-'}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 bg-gray-100 border-t-2 border-l border-gray-300 px-3 py-2 text-center text-sm font-bold text-indigo-600">
                    {formatHours(grandTotal)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Required for React.Fragment with key
import React from 'react'
