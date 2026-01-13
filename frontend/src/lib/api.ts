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

// Health check
export const healthCheck = async () => {
  const response = await api.get('/health')
  return response.data
}
