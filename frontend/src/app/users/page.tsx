'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  username: string
  first_name: string | null
  last_name: string | null
  email: string
  user_type: 'administrator' | 'project_manager' | 'actor'
  daily_work_hours: number
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

const USER_TYPE_LABELS: Record<string, string> = {
  administrator: 'Administrateur',
  project_manager: 'Chef de projet',
  actor: 'Acteur'
}

const USER_TYPE_COLORS: Record<string, string> = {
  administrator: 'bg-purple-100 text-purple-800',
  project_manager: 'bg-blue-100 text-blue-800',
  actor: 'bg-gray-100 text-gray-800'
}

export default function UsersPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    user_type: 'actor' as 'administrator' | 'project_manager' | 'actor',
    daily_work_hours: '8'
  })
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      if (userData.user_type !== 'administrator') {
        router.push('/dashboard')
        return
      }
      setCurrentUser(userData)
      fetchUsers()
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/login')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUsers = async () => {
    try {
      const { adminUsersAPI } = await import('@/lib/api')
      const data = await adminUsersAPI.getAll()
      setUsers(data.users)
    } catch (error: any) {
      console.error('Error fetching users:', error)
      setError(error.response?.data?.error || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setModalMode('create')
    setEditingUser(null)
    setFormData({
      email: '',
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      user_type: 'actor',
      daily_work_hours: '8'
    })
    setFormError('')
    setShowModal(true)
  }

  const openEditModal = (user: User) => {
    setModalMode('edit')
    setEditingUser(user)
    setFormData({
      email: user.email,
      username: user.username,
      password: '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      user_type: user.user_type,
      daily_work_hours: (user.daily_work_hours || 8).toString()
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!formData.email.trim()) {
      setFormError('Email is required')
      return
    }
    if (!formData.username.trim()) {
      setFormError('Username is required')
      return
    }
    if (modalMode === 'create' && !formData.password) {
      setFormError('Password is required')
      return
    }
    if (formData.password && formData.password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    const dailyHours = parseFloat(formData.daily_work_hours)
    if (isNaN(dailyHours) || dailyHours < 1 || dailyHours > 24) {
      setFormError('Daily work hours must be between 1 and 24')
      return
    }

    setIsSubmitting(true)
    try {
      const { adminUsersAPI } = await import('@/lib/api')

      if (modalMode === 'create') {
        await adminUsersAPI.create({
          email: formData.email.trim(),
          username: formData.username.trim(),
          password: formData.password,
          first_name: formData.first_name.trim() || undefined,
          last_name: formData.last_name.trim() || undefined,
          user_type: formData.user_type,
          daily_work_hours: dailyHours
        })
      } else if (editingUser) {
        const updateData: any = {
          email: formData.email.trim(),
          username: formData.username.trim(),
          first_name: formData.first_name.trim() || undefined,
          last_name: formData.last_name.trim() || undefined,
          user_type: formData.user_type,
          daily_work_hours: dailyHours
        }
        if (formData.password) {
          updateData.password = formData.password
        }
        await adminUsersAPI.update(editingUser.id, updateData)
      }

      setShowModal(false)
      await fetchUsers()
    } catch (error: any) {
      console.error('Error saving user:', error)
      setFormError(error.response?.data?.error || 'Failed to save user')
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = (user: User) => {
    setUserToDelete(user)
    setShowDeleteConfirm(true)
  }

  const handleDelete = async () => {
    if (!userToDelete) return

    setIsDeleting(true)
    try {
      const { adminUsersAPI } = await import('@/lib/api')
      await adminUsersAPI.delete(userToDelete.id)
      setShowDeleteConfirm(false)
      setUserToDelete(null)
      await fetchUsers()
    } catch (error: any) {
      console.error('Error deleting user:', error)
      setError(error.response?.data?.error || 'Failed to delete user')
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleUserActive = async (user: User) => {
    try {
      const { adminUsersAPI } = await import('@/lib/api')
      await adminUsersAPI.update(user.id, { is_active: !user.is_active })
      await fetchUsers()
    } catch (error: any) {
      console.error('Error toggling user status:', error)
      setError(error.response?.data?.error || 'Failed to update user status')
    }
  }

  if (!currentUser) {
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des utilisateurs</h1>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Nouvel utilisateur
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">
              <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun utilisateur</h3>
              <p className="mt-1 text-sm text-gray-500">Commencez par créer un nouvel utilisateur.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rôle
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    h/jour
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dernière connexion
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className={!user.is_active ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-indigo-600 font-medium text-sm">
                              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
                              {(user.last_name?.[0] || user.username[1] || '').toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name && user.last_name
                              ? `${user.first_name} ${user.last_name}`
                              : user.username}
                          </div>
                          <div className="text-sm text-gray-500">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${USER_TYPE_COLORS[user.user_type]}`}>
                        {USER_TYPE_LABELS[user.user_type]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-900">{user.daily_work_hours || 8}h</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleUserActive(user)}
                        disabled={user.id === currentUser.id}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          user.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        } ${user.id === currentUser.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={user.id === currentUser.id ? 'Vous ne pouvez pas vous désactiver' : (user.is_active ? 'Cliquez pour désactiver' : 'Cliquez pour activer')}
                      >
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Jamais'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => confirmDelete(user)}
                        disabled={user.id === currentUser.id}
                        className={`text-red-600 hover:text-red-900 ${user.id === currentUser.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={user.id === currentUser.id ? 'Vous ne pouvez pas vous supprimer' : ''}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Prénom"
                  />
                </div>
                <div>
                  <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nom
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom d'utilisateur *
                </label>
                <input
                  type="text"
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="nom.utilisateur"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="email@exemple.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe {modalMode === 'create' ? '*' : '(laisser vide pour ne pas changer)'}
                </label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder={modalMode === 'create' ? 'Minimum 8 caractères' : '••••••••'}
                  minLength={modalMode === 'create' ? 8 : undefined}
                  required={modalMode === 'create'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Rôle *
                  </label>
                  <select
                    id="user_type"
                    value={formData.user_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, user_type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  >
                    <option value="actor">Acteur</option>
                    <option value="project_manager">Chef de projet</option>
                    <option value="administrator">Administrateur</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="daily_work_hours" className="block text-sm font-medium text-gray-700 mb-1">
                    Heures/jour *
                  </label>
                  <input
                    type="number"
                    id="daily_work_hours"
                    value={formData.daily_work_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, daily_work_hours: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    min="1"
                    max="24"
                    step="0.5"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Temps de travail journalier</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Enregistrement...' : (modalMode === 'create' ? 'Créer' : 'Enregistrer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Confirmer la suppression</h3>
                <p className="text-sm text-gray-500">Cette action est irréversible</p>
              </div>
            </div>

            <p className="text-gray-700 mb-6">
              Êtes-vous sûr de vouloir supprimer l'utilisateur{' '}
              <span className="font-semibold">
                {userToDelete.first_name && userToDelete.last_name
                  ? `${userToDelete.first_name} ${userToDelete.last_name}`
                  : userToDelete.username}
              </span>{' '}
              (@{userToDelete.username}) ?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setUserToDelete(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
