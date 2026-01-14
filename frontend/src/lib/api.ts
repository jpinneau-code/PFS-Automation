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

// Health check
export const healthCheck = async () => {
  const response = await api.get('/health')
  return response.data
}
