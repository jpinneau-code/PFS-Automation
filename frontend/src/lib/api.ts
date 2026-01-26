import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Setup API functions
export const setupAPI = {
  checkStatus: async () => {
    const response = await api.get('/api/setup/status')
    return response.data
  },

  completeSetup: async (data: {
    email: string
    username: string
    password: string
    firstName?: string
    lastName?: string
  }) => {
    const response = await api.post('/api/setup/complete', data)
    return response.data
  },
}

// Auth API functions
export const authAPI = {
  login: async (data: { username: string; password: string }) => {
    const response = await api.post('/api/auth/login', data)
    return response.data
  },

  forgotPassword: async (identifier: string) => {
    const response = await api.post('/api/auth/forgot-password', { identifier })
    return response.data
  },

  resetPassword: async (data: { token: string; newPassword: string }) => {
    const response = await api.post('/api/auth/reset-password', data)
    return response.data
  },
}

// Projects API functions
export const projectsAPI = {
  getUserProjects: async (userId: number) => {
    const response = await api.get(`/api/users/${userId}/projects`)
    return response.data
  },

  getById: async (projectId: number) => {
    const response = await api.get(`/api/projects/${projectId}`)
    return response.data
  },

  create: async (data: {
    project_name: string
    client_id: number
    project_manager_id: number
    description?: string
  }) => {
    const response = await api.post('/api/projects', data)
    return response.data
  },

  reorderStages: async (projectId: number, stageIds: number[]) => {
    const response = await api.put(`/api/projects/${projectId}/stages/reorder`, { stageIds })
    return response.data
  },

  update: async (projectId: number, data: {
    project_name?: string
    description?: string | null
    status?: string
    project_type_id?: number | null
    erp_ref?: string | null
  }) => {
    const response = await api.put(`/api/projects/${projectId}`, data)
    return response.data
  },

  delete: async (projectId: number, userId: number, password: string) => {
    const response = await api.delete(`/api/projects/${projectId}`, {
      data: { user_id: userId, password }
    })
    return response.data
  },

  getTimesheetSummary: async (projectId: number) => {
    const response = await api.get(`/api/projects/${projectId}/timesheet-summary`)
    return response.data
  },
}

// Stages API functions
export const stagesAPI = {
  create: async (projectId: number, data: { stage_name: string; description?: string }) => {
    const response = await api.post(`/api/projects/${projectId}/stages`, data)
    return response.data
  },

  update: async (stageId: number, data: {
    stage_name?: string
    description?: string
    start_date?: string | null
    end_date?: string | null
  }) => {
    const response = await api.put(`/api/stages/${stageId}`, data)
    return response.data
  },

  delete: async (stageId: number) => {
    const response = await api.delete(`/api/stages/${stageId}`)
    return response.data
  },

  reorderTasks: async (stageId: number | null, taskIds: number[]) => {
    const response = await api.put(`/api/stages/${stageId ?? 'null'}/tasks/reorder`, { taskIds })
    return response.data
  },
}

// Tasks API functions
export const tasksAPI = {
  create: async (projectId: number, data: {
    task_name: string
    stage_id?: number | null
    parent_task_id?: number | null
    description?: string
    priority?: string
    responsible_id?: number | null
    sold_days?: number
  }) => {
    const response = await api.post(`/api/projects/${projectId}/tasks`, data)
    return response.data
  },

  update: async (taskId: number, data: {
    task_name?: string
    description?: string | null
    priority?: string
    status?: string
    responsible_id?: number | null
    sold_days?: number
    start_date?: string | null
    due_date?: string | null
    stage_id?: number | null
  }) => {
    const response = await api.put(`/api/tasks/${taskId}`, data)
    return response.data
  },

  delete: async (taskId: number) => {
    const response = await api.delete(`/api/tasks/${taskId}`)
    return response.data
  },

  reorderSubtasks: async (taskId: number, subtaskIds: number[]) => {
    const response = await api.put(`/api/tasks/${taskId}/subtasks/reorder`, { subtaskIds })
    return response.data
  },
}

// Clients API functions
export const clientsAPI = {
  getAll: async () => {
    const response = await api.get('/api/clients')
    return response.data
  },

  create: async (client_name: string) => {
    const response = await api.post('/api/clients', { client_name })
    return response.data
  },
}

// Project Types API functions
export const projectTypesAPI = {
  getAll: async () => {
    const response = await api.get('/api/project-types')
    return response.data
  },
}

// Users API functions
export const usersAPI = {
  getProjectManagers: async () => {
    const response = await api.get('/api/users/project-managers')
    return response.data
  },

  getAll: async () => {
    const response = await api.get('/api/users/all')
    return response.data
  },
}

// Admin Users API functions
export const adminUsersAPI = {
  getAll: async () => {
    const response = await api.get('/api/admin/users')
    return response.data
  },

  create: async (data: {
    email: string
    username: string
    password: string
    first_name?: string
    last_name?: string
    user_type: 'administrator' | 'project_manager' | 'actor'
    daily_work_hours?: number
  }) => {
    const response = await api.post('/api/admin/users', data)
    return response.data
  },

  update: async (userId: number, data: {
    email?: string
    username?: string
    password?: string
    first_name?: string
    last_name?: string
    user_type?: 'administrator' | 'project_manager' | 'actor'
    is_active?: boolean
    daily_work_hours?: number
  }) => {
    const response = await api.put(`/api/admin/users/${userId}`, data)
    return response.data
  },

  delete: async (userId: number) => {
    const response = await api.delete(`/api/admin/users/${userId}`)
    return response.data
  },
}

// Timesheet API functions
export const timesheetAPI = {
  // Get timesheet data for a month
  getData: async (userId: number, year: number, month: number, viewUserId?: number) => {
    const params = new URLSearchParams({
      user_id: userId.toString(),
      year: year.toString(),
      month: month.toString(),
    })
    if (viewUserId) {
      params.append('view_user_id', viewUserId.toString())
    }
    const response = await api.get(`/api/timesheet?${params}`)
    return response.data
  },

  // Create or update a timesheet entry
  saveEntry: async (data: {
    user_id: number
    task_id: number
    date: string
    hours: number
    description?: string
    entered_by: number
  }) => {
    const response = await api.post('/api/timesheet/entries', data)
    return response.data
  },

  // Delete a timesheet entry
  deleteEntry: async (entryId: number, userId: number) => {
    const response = await api.delete(`/api/timesheet/entries/${entryId}?user_id=${userId}`)
    return response.data
  },

  // Lock a month
  lockMonth: async (data: {
    project_id?: number | null
    year: number
    month: number
    locked_by: number
  }) => {
    const response = await api.post('/api/timesheet/locks', data)
    return response.data
  },

  // Unlock a month
  unlockMonth: async (lockId: number, userId: number) => {
    const response = await api.delete(`/api/timesheet/locks/${lockId}?user_id=${userId}`)
    return response.data
  },

  // Get viewable users (for PM/Admin)
  getViewableUsers: async (userId: number) => {
    const response = await api.get(`/api/timesheet/viewable-users?user_id=${userId}`)
    return response.data
  },

  // Update remaining hours on a task
  updateRemainingHours: async (taskId: number, remainingHours: number, userId: number) => {
    const response = await api.put(`/api/tasks/${taskId}/remaining`, {
      remaining_hours: remainingHours,
      user_id: userId
    })
    return response.data
  },
}

// User Settings API functions
export const userSettingsAPI = {
  // Get all settings for a user
  getAll: async (userId: number) => {
    const response = await api.get(`/api/users/${userId}/settings`)
    return response.data
  },

  // Update a single setting
  update: async (userId: number, key: string, value: string) => {
    const response = await api.put(`/api/users/${userId}/settings/${key}`, { value })
    return response.data
  },

  // Delete a setting
  delete: async (userId: number, key: string) => {
    const response = await api.delete(`/api/users/${userId}/settings/${key}`)
    return response.data
  },
}

// Health check
export const healthCheck = async () => {
  const response = await api.get('/health')
  return response.data
}
