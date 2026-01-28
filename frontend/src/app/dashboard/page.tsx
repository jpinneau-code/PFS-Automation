'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Project {
  id: number
  project_name: string
  client_name: string
  status: string
  team_size: number
  total_tasks: number
  completed_tasks: number
  project_manager_first_name?: string
  project_manager_last_name?: string
  project_manager_username: string
  total_sold_days: number
  total_remaining_hours: number
  total_hours_spent: number
  project_type_name?: string | null
}

interface Client {
  id: number
  client_name: string
}

interface ProjectManager {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([])
  const [newProject, setNewProject] = useState({
    project_name: '',
    client_id: 0,
    project_manager_id: 0,
    description: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [showNewClientInput, setShowNewClientInput] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [isCreatingClient, setIsCreatingClient] = useState(false)
  const [stats, setStats] = useState({
    totalUsers: 1,
    activeProjects: 0,
    completedTasks: 0,
    pendingTasks: 0,
  })

  // Import project state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<any>(null)

  useEffect(() => {
    // Check if user is authenticated
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      setUser(userData)

      // Fetch user's projects
      fetchUserProjects(userData.id)
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/login')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUserProjects = async (userId: number) => {
    try {
      const { projectsAPI } = await import('@/lib/api')
      const data = await projectsAPI.getUserProjects(userId)
      setProjects(data.projects)
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const openAddProjectModal = async () => {
    setShowAddProjectModal(true)
    setFormError('')
    setNewProject({ project_name: '', client_id: 0, project_manager_id: 0, description: '' })
    setShowNewClientInput(false)
    setNewClientName('')

    try {
      const { clientsAPI, usersAPI } = await import('@/lib/api')
      const [clientsData, pmData] = await Promise.all([
        clientsAPI.getAll(),
        usersAPI.getProjectManagers()
      ])
      setClients(clientsData.clients)
      setProjectManagers(pmData.projectManagers)

      // Pre-select current user as PM if they are a project manager
      if (user?.user_type === 'project_manager') {
        setNewProject(prev => ({ ...prev, project_manager_id: user.id }))
      }
    } catch (error) {
      console.error('Error loading form data:', error)
      setFormError('Failed to load form data')
    }
  }

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      setFormError('Client name is required')
      return
    }

    setIsCreatingClient(true)
    setFormError('')

    try {
      const { clientsAPI } = await import('@/lib/api')
      const data = await clientsAPI.create(newClientName.trim())

      // Add new client to list and select it
      setClients(prev => [...prev, data.client].sort((a, b) => a.client_name.localeCompare(b.client_name)))
      setNewProject(prev => ({ ...prev, client_id: data.client.id }))

      // Reset client creation form
      setShowNewClientInput(false)
      setNewClientName('')
    } catch (error: any) {
      console.error('Error creating client:', error)
      setFormError(error.response?.data?.error || 'Failed to create client')
    } finally {
      setIsCreatingClient(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!newProject.project_name.trim()) {
      setFormError('Project name is required')
      return
    }
    if (!newProject.client_id) {
      setFormError('Please select a client')
      return
    }
    if (!newProject.project_manager_id) {
      setFormError('Please select a project manager')
      return
    }

    setIsSubmitting(true)
    try {
      const { projectsAPI } = await import('@/lib/api')
      const result = await projectsAPI.create(newProject)
      setShowAddProjectModal(false)
      // Navigate to the new project's follow-up page
      router.push(`/projects/${result.project.id}`)
    } catch (error: any) {
      console.error('Error creating project:', error)
      setFormError(error.response?.data?.error || 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = () => {
    // Clear user data from localStorage
    localStorage.removeItem('user')
    // Redirect to login page
    router.push('/login')
  }

  const openImportModal = () => {
    setShowImportModal(true)
    setImportFile(null)
    setImportError('')
    setImportResult(null)
  }

  const handleImportProject = async () => {
    if (!importFile) {
      setImportError('Please select a file')
      return
    }

    setIsImporting(true)
    setImportError('')

    try {
      const fileContent = await importFile.text()
      const importData = JSON.parse(fileContent)

      const { projectsAPI } = await import('@/lib/api')
      const result = await projectsAPI.importProject(importData)

      setImportResult(result)

      // Refresh projects list
      if (user) {
        fetchUserProjects(user.id)
      }
    } catch (error: any) {
      console.error('Error importing project:', error)
      if (error instanceof SyntaxError) {
        setImportError('Invalid JSON file')
      } else {
        setImportError(error.response?.data?.error || 'Failed to import project')
      }
    } finally {
      setIsImporting(false)
    }
  }

  // Show loading while checking authentication
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Welcome, {user.first_name || user.username}
            </span>
            <button
              onClick={() => router.push('/timesheet')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Timesheet
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Total Users Card */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                    <dd className="text-lg font-semibold text-gray-900">{stats.totalUsers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Active Projects Card */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Projects</dt>
                    <dd className="text-lg font-semibold text-gray-900">{stats.activeProjects}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Completed Tasks Card */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Completed Tasks</dt>
                    <dd className="text-lg font-semibold text-gray-900">{stats.completedTasks}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Tasks Card */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Tasks</dt>
                    <dd className="text-lg font-semibold text-gray-900">{stats.pendingTasks}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Projects List */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                {user?.user_type === 'administrator' ? 'All Active Projects' : 'My Projects'}
              </h2>
              {(user?.user_type === 'administrator' || user?.user_type === 'project_manager') && (
                <>
                  <button
                    onClick={openAddProjectModal}
                    className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-sm"
                    title="Add new project"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    onClick={openImportModal}
                    className="w-8 h-8 flex items-center justify-center bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors shadow-sm"
                    title="Import project"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <span className="text-sm text-gray-500">
              {loading ? 'Loading...' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
              <p className="mt-1 text-sm text-gray-500">
                {user?.user_type === 'administrator'
                  ? 'No active projects found in the system.'
                  : user?.user_type === 'project_manager'
                  ? 'You are not managing any projects yet.'
                  : 'You are not assigned to any projects yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sold
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spent
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Forecast
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gap
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {projects.map((project) => {
                    // Calculations based on Dashboard-formula.md
                    const soldDays = parseFloat(String(project.total_sold_days)) || 0
                    const spentDays = (parseFloat(String(project.total_hours_spent)) || 0) / 8
                    const remainingDays = (parseFloat(String(project.total_remaining_hours)) || 0) / 8
                    const forecastDays = spentDays + remainingDays

                    // Advancement = Spent / Sold (percentage of sold days already spent)
                    const advancementPercent = soldDays > 0 ? (spentDays / soldDays) * 100 : 0

                    // Gap = (Forecast / Sold) - 1 (positive = over budget, negative = under budget)
                    const gapPercent = soldDays > 0 ? ((forecastDays / soldDays) - 1) * 100 : 0

                    // Format number with 1 decimal if needed
                    const formatDays = (value: number) => {
                      if (value === 0) return '-'
                      return value % 1 === 0 ? value.toString() : value.toFixed(1)
                    }

                    const formatPercent = (value: number) => {
                      if (value === 0) return '0%'
                      return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`
                    }

                    return (
                      <tr
                        key={project.id}
                        onClick={() => router.push(`/projects/${project.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {project.client_name}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{project.project_name}</span>
                            {project.project_type_name && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                {project.project_type_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            project.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            project.status === 'created' ? 'bg-gray-100 text-gray-800' :
                            project.status === 'frozen' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {project.status === 'in_progress' ? 'In Progress' :
                             project.status === 'created' ? 'Created' :
                             project.status === 'frozen' ? 'Frozen' : 'Closed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatDays(soldDays)}d
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatDays(spentDays)}d
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatDays(remainingDays)}d
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                          {formatDays(forecastDays)}d
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className="text-gray-900">
                            {soldDays > 0 ? `${advancementPercent.toFixed(0)}%` : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {soldDays > 0 && gapPercent !== 0 && gapPercent !== -100 ? (
                            <span className={`font-medium ${gapPercent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatPercent(gapPercent)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {user?.user_type === 'administrator' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => router.push('/users')}
                className="px-4 py-3 border border-gray-300 rounded-md text-left hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-900">Gérer les utilisateurs</div>
                <div className="text-sm text-gray-500">Ajouter, modifier ou supprimer des utilisateurs</div>
              </button>
              <button className="px-4 py-3 border border-gray-300 rounded-md text-left hover:bg-gray-50 transition-colors">
                <div className="font-medium text-gray-900">Paramètres système</div>
                <div className="text-sm text-gray-500">Configurer l'application</div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Add Project Modal */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">New Project</h3>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  id="project_name"
                  value={newProject.project_name}
                  onChange={(e) => setNewProject(prev => ({ ...prev, project_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter project name"
                />
              </div>

              <div>
                <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Client *
                </label>
                {!showNewClientInput ? (
                  <div className="flex gap-2">
                    <select
                      id="client_id"
                      value={newProject.client_id}
                      onChange={(e) => setNewProject(prev => ({ ...prev, client_id: parseInt(e.target.value) }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value={0}>Select a client</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>{client.client_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewClientInput(true)}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors border border-gray-300"
                      title="Add new client"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Enter new client name"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateClient}
                        disabled={isCreatingClient}
                        className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                        title="Create client"
                      >
                        {isCreatingClient ? (
                          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewClientInput(false); setNewClientName(''); }}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors border border-gray-300"
                        title="Cancel"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">Enter the name and click the checkmark to create a new client</p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="project_manager_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Manager *
                </label>
                <select
                  id="project_manager_id"
                  value={newProject.project_manager_id}
                  onChange={(e) => setNewProject(prev => ({ ...prev, project_manager_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value={0}>Select a project manager</option>
                  {projectManagers.map(pm => (
                    <option key={pm.id} value={pm.id}>
                      {pm.first_name && pm.last_name
                        ? `${pm.first_name} ${pm.last_name}`
                        : pm.username}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={newProject.description}
                  onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter project description (optional)"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Project Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Import Project</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {importError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {importError}
                </div>
              )}

              {importResult ? (
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm font-medium text-green-800">Project imported successfully!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Project: <strong>{importResult.project_name}</strong>
                    </p>
                    <ul className="text-sm text-green-600 mt-2 space-y-1">
                      <li>• {importResult.summary.users_processed} users processed</li>
                      <li>• {importResult.summary.stages_created} stages created</li>
                      <li>• {importResult.summary.tasks_created} tasks created</li>
                      <li>• {importResult.summary.timesheet_entries_created} timesheet entries created</li>
                    </ul>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowImportModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => router.push(`/projects/${importResult.project_id}`)}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      View Project
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select JSON file to import
                    </label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {importFile && (
                      <p className="text-sm text-gray-500 mt-1">
                        Selected: {importFile.name}
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-sm text-blue-700">
                      <strong>Note:</strong> Users that don't exist will be created with a temporary password.
                      They will need to reset their password on first login.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowImportModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImportProject}
                      disabled={isImporting || !importFile}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isImporting ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
