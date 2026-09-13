import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const features = [
  {
    icon: '✦',
    title: 'Plan Together',
    description: 'Organise your itinerary with your group and keep everyone in the loop.',
  },
  {
    icon: '↗',
    title: 'Track Budgets',
    description: "Keep track of each person's individual spending limit with ease.",
  },
  {
    icon: '÷',
    title: 'Split Expenses',
    description: 'Record and divide shared expenses fairly between members.',
  },
]

const expenseCategories = [
  'Accommodation',
  'Transport',
  'Food',
  'Activities',
  'Shopping',
  'Other',
]

function getTripStatus(trip) {
  const startDate = trip?.start_date
  const endDate = trip?.end_date
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
    startDate <= endDate

  if (!validDates) {
    return { key: 'unknown', label: 'Dates unavailable' }
  }

  const today = new Date()
  const todayDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  if (todayDate < startDate) {
    return { key: 'upcoming', label: 'Upcoming' }
  }
  if (todayDate > endDate) {
    return { key: 'completed', label: 'Completed' }
  }
  return { key: 'in-progress', label: 'In progress' }
}

function getTripDuration(startDate, endDate) {
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate)

  if (!validDates) {
    return null
  }

  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  )
  const end = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
  )
  const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1

  return duration > 0 ? duration : null
}

function formatTripDate(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return 'Date unavailable'
  }

  const date = new Date(`${dateValue}T00:00:00`)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function isValidDateOnly(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return false
  }

  const year = Number(dateValue.slice(0, 4))
  const month = Number(dateValue.slice(5, 7))
  const day = Number(dateValue.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function getItineraryDayNumber(startDate, activityDate) {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(activityDate)) {
    return null
  }

  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  )
  const activity = Date.UTC(
    Number(activityDate.slice(0, 4)),
    Number(activityDate.slice(5, 7)) - 1,
    Number(activityDate.slice(8, 10)),
  )
  const dayNumber = Math.floor((activity - start) / (1000 * 60 * 60 * 24)) + 1

  return dayNumber > 0 ? dayNumber : null
}

function formatItineraryDate(dateValue) {
  if (!isValidDateOnly(dateValue)) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateValue}T00:00:00Z`))
}

function formatItineraryTime(timeValue) {
  if (!/^\d{2}:\d{2}/.test(timeValue || '')) {
    return ''
  }

  const [hours, minutes] = timeValue.slice(0, 5).split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12

  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}

function getTodayDateOnly() {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatOverviewDate(dateValue) {
  if (!isValidDateOnly(dateValue)) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateValue}T00:00:00Z`))
}

function formatTripDateRange(startDate, endDate) {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
    return 'Dates unavailable'
  }

  const start = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${startDate}T00:00:00Z`))
  const end = formatOverviewDate(endDate)

  return `${start} – ${end}`
}

function createEqualSplitRows(expenseId, amount, memberIds) {
  const amountInPence = Math.round(amount * 100)
  const baseSplitInPence = Math.floor(amountInPence / memberIds.length)

  return memberIds.map((userId, index) => ({
    expense_id: expenseId,
    user_id: userId,
    amount_owed: (index === memberIds.length - 1
      ? amountInPence - (baseSplitInPence * (memberIds.length - 1))
      : baseSplitInPence) / 100,
  }))
}

function getAuthErrorMessage(error) {
  const message = error?.message?.toLowerCase() || ''

  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }
  if (message.includes('already registered')) {
    return 'An account with this email already exists.'
  }
  if (message.includes('valid email')) {
    return 'Please enter a valid email address.'
  }
  if (message.includes('password')) {
    return 'Please check that your password meets the requirements.'
  }

  return 'Something went wrong. Please try again.'
}

function formatCurrency(value) {
  return `£${Number(value || 0).toFixed(2)}`
}

function getMemberLabel(userId, members, profiles) {
  const profileName = profiles[userId]?.full_name
  if (profileName) {
    return profileName
  }

  const memberIndex = members.findIndex((member) => member.user_id === userId)
  return memberIndex >= 0 ? `Member ${memberIndex + 1}` : 'Unknown member'
}

function calculateSettlements(budgetSummaries) {
  const creditors = budgetSummaries
    .filter((member) => Math.round(member.netBalance * 100) > 0)
    .map((member) => ({
      label: member.label,
      remainingPence: Math.round(member.netBalance * 100),
    }))
  const debtors = budgetSummaries
    .filter((member) => Math.round(member.netBalance * 100) < 0)
    .map((member) => ({
      label: member.label,
      remainingPence: Math.abs(Math.round(member.netBalance * 100)),
    }))
  const settlements = []
  let debtorIndex = 0
  let creditorIndex = 0

  // Match each debtor with the current creditor until one balance is settled.
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const transferPence = Math.min(debtor.remainingPence, creditor.remainingPence)

    if (transferPence > 0) {
      settlements.push({
        from: debtor.label,
        to: creditor.label,
        amount: transferPence / 100,
      })
    }

    debtor.remainingPence -= transferPence
    creditor.remainingPence -= transferPence

    if (debtor.remainingPence <= 1) {
      debtorIndex += 1
    }
    if (creditor.remainingPence <= 1) {
      creditorIndex += 1
    }
  }

  const totalDebtorPence = debtors.reduce((total, debtor) => total + debtor.remainingPence, 0)
  const totalCreditorPence = creditors.reduce((total, creditor) => total + creditor.remainingPence, 0)

  return {
    settlements,
    hasSignificantDifference: Math.abs(totalDebtorPence - totalCreditorPence) > 1,
  }
}

function calculateTripHealth(totalTripBudget, totalSpending, largestCategory) {
  if (totalTripBudget <= 0) {
    return {
      status: 'none',
      label: 'No budget set',
      usagePercentage: 0,
      remaining: 0,
      explanation: 'Set member budgets to see your trip health.',
      supportingMessages: [],
    }
  }

  const usagePercentage = (totalSpending / totalTripBudget) * 100
  const remaining = totalTripBudget - totalSpending
  let status = 'good'
  let label = 'Good'
  let explanation = `You're currently within your trip budget with ${formatCurrency(remaining)} remaining.`

  if (usagePercentage > 90) {
    status = 'over'
    label = 'Over budget'
    explanation = remaining < 0
      ? `Your group has exceeded the planned budget by ${formatCurrency(Math.abs(remaining))}.`
      : `You've used ${Math.round(usagePercentage)}% of the trip budget. Consider keeping an eye on further spending.`
  } else if (usagePercentage >= 70) {
    status = 'watch'
    label = 'Watch your spending'
    explanation = `You've used ${Math.round(usagePercentage)}% of the trip budget. Consider keeping an eye on further spending.`
  }

  const supportingMessages = []
  if (largestCategory?.percentage >= 50) {
    supportingMessages.push(`${largestCategory.category} accounts for most of your spending.`)
  }

  return {
    status,
    label,
    usagePercentage,
    remaining,
    explanation,
    supportingMessages,
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLogoutLoading, setIsLogoutLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState({ type: '', text: '' })
  const [trips, setTrips] = useState([])
  const [isTripsLoading, setIsTripsLoading] = useState(false)
  const [tripsError, setTripsError] = useState('')
  const [tripSuccessMessage, setTripSuccessMessage] = useState('')
  const [tripDetailsRetryKey, setTripDetailsRetryKey] = useState(0)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [tripMembers, setTripMembers] = useState([])
  const [profiles, setProfiles] = useState({})
  const [isMembersLoading, setIsMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [removingMemberId, setRemovingMemberId] = useState('')
  const [memberActionMessage, setMemberActionMessage] = useState({ type: '', text: '' })
  const [editingMemberId, setEditingMemberId] = useState('')
  const [editBudgetValue, setEditBudgetValue] = useState('')
  const [savingBudgetMemberId, setSavingBudgetMemberId] = useState('')
  const [expenses, setExpenses] = useState([])
  const [expenseSplits, setExpenseSplits] = useState([])
  const [isExpensesLoading, setIsExpensesLoading] = useState(false)
  const [expensesError, setExpensesError] = useState('')
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [isExpenseSaving, setIsExpenseSaving] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState('')
  const [editingExpenseId, setEditingExpenseId] = useState('')
  const [expenseFormMessage, setExpenseFormMessage] = useState({ type: '', text: '' })
  const [expenseFormValues, setExpenseFormValues] = useState({
    description: '',
    amount: '',
    paidBy: '',
    sharedBy: [],
    category: 'Other',
  })
  const [itineraryItems, setItineraryItems] = useState([])
  const [isItineraryLoading, setIsItineraryLoading] = useState(false)
  const [itineraryError, setItineraryError] = useState('')
  const [isItineraryFormOpen, setIsItineraryFormOpen] = useState(false)
  const [isItinerarySaving, setIsItinerarySaving] = useState(false)
  const [deletingItineraryId, setDeletingItineraryId] = useState('')
  const [itineraryFormMessage, setItineraryFormMessage] = useState({ type: '', text: '' })
  const [editingItineraryId, setEditingItineraryId] = useState('')
  const [itineraryFormValues, setItineraryFormValues] = useState({
    title: '',
    description: '',
    activityDate: '',
    startTime: '',
    endTime: '',
    location: '',
  })
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [isMemberSaving, setIsMemberSaving] = useState(false)
  const [memberSaveStage, setMemberSaveStage] = useState('')
  const [memberFormMessage, setMemberFormMessage] = useState({ type: '', text: '' })
  const [memberFormValues, setMemberFormValues] = useState({
    email: '',
    budget: '',
  })
  const [isTripFormOpen, setIsTripFormOpen] = useState(false)
  const [isTripSaving, setIsTripSaving] = useState(false)
  const [tripFormMessage, setTripFormMessage] = useState('')
  const [tripFormValues, setTripFormValues] = useState({
    name: '',
    destination: '',
    startDate: '',
    endDate: '',
  })
  const [formValues, setFormValues] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const loadProfiles = useCallback(async (members) => {
    const memberIds = members.map((member) => member.user_id)

    if (memberIds.length === 0) {
      setProfiles({})
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberIds)

    if (profileError) {
      console.error('We could not load member profiles.', profileError)
      setProfiles({})
      return
    }

    const profilesById = (profileData || []).reduce((profileMap, profile) => ({
      ...profileMap,
      [profile.id]: {
        id: profile.id,
        full_name: profile.full_name,
      },
    }), {})

    setProfiles(profilesById)
  }, [])

  const refreshTripMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('trip_members')
      .select('*')
      .eq('trip_id', selectedTrip.id)

    if (error) {
      return false
    }

    const members = data || []
    setTripMembers(members)
    await loadProfiles(members)
    return true
  }, [loadProfiles, selectedTrip])

  const refreshTrips = useCallback(async () => {
    if (!session) {
      return false
    }

    setIsTripsLoading(true)
    setTripsError('')

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('created_by', session.user.id)
      .order('start_date', { ascending: true })

    if (error) {
      setTripsError('We could not load your trips. Please try again.')
      setIsTripsLoading(false)
      return false
    }

    setTrips(data || [])
    setIsTripsLoading(false)
    return true
  }, [session])

  const refreshExpenses = useCallback(async () => {
    if (!selectedTrip) {
      return false
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', selectedTrip.id)

    if (error) {
      return false
    }

    const refreshedExpenses = data || []
    setExpenses(refreshedExpenses)

    if (refreshedExpenses.length === 0) {
      setExpenseSplits([])
      return true
    }

    const expenseIds = refreshedExpenses.map((expense) => expense.id)
    const { data: splitData, error: splitError } = await supabase
      .from('expense_splits')
      .select('*')
      .in('expense_id', expenseIds)

    if (splitError) {
      setExpenseSplits([])
      return false
    }

    setExpenseSplits(splitData || [])
    return true
  }, [selectedTrip])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (isMounted) {
        setSession(currentSession)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession)
      },
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const loadTrips = async () => {
      await refreshTrips()
    }

    loadTrips()
  }, [refreshTrips, session])

  useEffect(() => {
    if (!selectedTrip) {
      return
    }

    const loadTripMembers = async () => {
      setIsMembersLoading(true)
      setMembersError('')

      const refreshed = await refreshTripMembers()

      if (!refreshed) {
        setMembersError('We could not load the members for this trip. Please try again.')
      }

      setIsMembersLoading(false)
    }

    loadTripMembers()
  }, [refreshTripMembers, selectedTrip, tripDetailsRetryKey])

  useEffect(() => {
    if (!selectedTrip) {
      return
    }

    const loadExpenses = async () => {
      setIsExpensesLoading(true)
      setExpensesError('')

      const refreshed = await refreshExpenses()
      if (!refreshed) {
        setExpensesError('We could not load the expenses for this trip. Please try again.')
      }

      setIsExpensesLoading(false)
    }

    loadExpenses()
  }, [refreshExpenses, selectedTrip, tripDetailsRetryKey])

  const refreshItinerary = useCallback(async () => {
    if (!selectedTrip) {
      return false
    }

    const { data, error } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', selectedTrip.id)
      .order('activity_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      return false
    }

    setItineraryItems(data || [])
    return true
  }, [selectedTrip])

  useEffect(() => {
    if (!selectedTrip) {
      return
    }

    const loadItinerary = async () => {
      setIsItineraryLoading(true)
      setItineraryError('')

      const refreshed = await refreshItinerary()

      if (!refreshed) {
        setItineraryError('We could not load the itinerary for this trip. Please try again.')
      }

      setIsItineraryLoading(false)
    }

    loadItinerary()
  }, [refreshItinerary, selectedTrip, tripDetailsRetryKey])

  useEffect(() => {
    if (!tripSuccessMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => setTripSuccessMessage(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [tripSuccessMessage])

  useEffect(() => {
    const successMessages = [
      memberActionMessage.type === 'success' ? 'memberActionMessage' : '',
      memberFormMessage.type === 'success' ? 'memberFormMessage' : '',
      expenseFormMessage.type === 'success' ? 'expenseFormMessage' : '',
      itineraryFormMessage.type === 'success' ? 'itineraryFormMessage' : '',
    ].filter(Boolean)

    if (successMessages.length === 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      if (successMessages.includes('memberActionMessage')) {
        setMemberActionMessage({ type: '', text: '' })
      }
      if (successMessages.includes('memberFormMessage')) {
        setMemberFormMessage({ type: '', text: '' })
      }
      if (successMessages.includes('expenseFormMessage')) {
        setExpenseFormMessage({ type: '', text: '' })
      }
      if (successMessages.includes('itineraryFormMessage')) {
        setItineraryFormMessage({ type: '', text: '' })
      }
    }, 4500)

    return () => window.clearTimeout(timeoutId)
  }, [expenseFormMessage, itineraryFormMessage, memberActionMessage, memberFormMessage])

  const openAuth = (mode = 'login') => {
    setAuthMode(mode)
    setAuthMessage({ type: '', text: '' })
    setIsAuthOpen(true)
  }

  const closeAuth = () => {
    if (!isLoading) {
      setIsAuthOpen(false)
      setAuthMessage({ type: '', text: '' })
    }
  }

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }))
    setAuthMessage({ type: '', text: '' })
  }

  const clearPasswords = () => {
    setFormValues((currentValues) => ({
      ...currentValues,
      password: '',
      confirmPassword: '',
    }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthMessage({ type: '', text: '' })

    if (authMode === 'signup' && formValues.password !== formValues.confirmPassword) {
      clearPasswords()
      setAuthMessage({ type: 'error', text: 'Your passwords do not match.' })
      return
    }

    setIsLoading(true)

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: formValues.email,
          password: formValues.password,
          options: {
            data: { full_name: formValues.fullName },
          },
        })

        if (error) throw error

        clearPasswords()
        setAuthMessage({
          type: 'success',
          text: data.session
            ? 'Your account has been created.'
            : 'Account created. Check your email to confirm your account.',
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formValues.email,
          password: formValues.password,
        })

        if (error) throw error

        clearPasswords()
        setAuthMessage({ type: 'success', text: 'You are now logged in.' })
      }
    } catch (error) {
      clearPasswords()
      setAuthMessage({ type: 'error', text: getAuthErrorMessage(error) })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    if (isLogoutLoading) {
      return
    }

    setIsLogoutLoading(true)
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthMessage({ type: 'error', text: 'We could not log you out. Please try again.' })
    }
    setIsLogoutLoading(false)
  }

  const retryTripDetails = () => {
    setTripDetailsRetryKey((currentKey) => currentKey + 1)
  }

  const openTripDetails = (trip) => {
    setSelectedTrip(trip)
    setTripMembers([])
    setMembersError('')
    setItineraryItems([])
    setItineraryError('')
  }

  const closeTripDetails = () => {
    setSelectedTrip(null)
    setTripMembers([])
    setMembersError('')
    setExpenses([])
    setExpenseSplits([])
    setExpensesError('')
    setIsAddMemberOpen(false)
    setMemberFormMessage({ type: '', text: '' })
    setIsAddExpenseOpen(false)
    setExpenseFormMessage({ type: '', text: '' })
    setEditingExpenseId('')
    setDeletingExpenseId('')
    setItineraryItems([])
    setItineraryError('')
    setIsItineraryFormOpen(false)
    setItineraryFormMessage({ type: '', text: '' })
    setEditingItineraryId('')
  }

  const openAddMemberForm = () => {
    setMemberFormMessage({ type: '', text: '' })
    setIsAddMemberOpen(true)
  }

  const closeAddMemberForm = () => {
    if (!isMemberSaving) {
      setIsAddMemberOpen(false)
      setMemberFormMessage({ type: '', text: '' })
    }
  }

  const handleMemberInputChange = (event) => {
    const { name, value } = event.target
    setMemberFormValues((currentValues) => ({ ...currentValues, [name]: value }))
    setMemberFormMessage({ type: '', text: '' })
  }

  const clearMemberForm = () => {
    setMemberFormValues({ email: '', budget: '' })
  }

  const handleAddMemberSubmit = async (event) => {
    event.preventDefault()
    setMemberFormMessage({ type: '', text: '' })

    if (!memberFormValues.email || !memberFormValues.budget) {
      setMemberFormMessage({ type: 'error', text: 'Please enter an email and budget.' })
      return
    }

    if (Number(memberFormValues.budget) <= 0) {
      setMemberFormMessage({ type: 'error', text: 'The budget must be greater than 0.' })
      return
    }

    setIsMemberSaving(true)
    setMemberSaveStage('finding')

    const { data: user, error: lookupError } = await supabase.functions.invoke(
      'lookup-user',
      { body: { email: memberFormValues.email.trim() } },
    )

    const userId = user?.id || user?.user?.id

    if (lookupError || !userId) {
      setMemberFormMessage({
        type: 'error',
        text: 'No registered user was found with that email address.',
      })
      setIsMemberSaving(false)
      setMemberSaveStage('')
      return
    }

    setMemberSaveStage('adding')
    const { error: insertError } = await supabase.from('trip_members').insert({
      trip_id: selectedTrip.id,
      user_id: userId,
      budget: Number(memberFormValues.budget),
    })

    if (insertError) {
      const message = insertError.code === '23505'
        ? 'This user is already a member of this trip.'
        : 'We could not add this member. Please try again.'
      setMemberFormMessage({ type: 'error', text: message })
      setIsMemberSaving(false)
      setMemberSaveStage('')
      return
    }

    const refreshed = await refreshTripMembers()

    if (!refreshed) {
      setMembersError('The member was added, but we could not refresh the member list.')
    }

    clearMemberForm()
    setIsAddMemberOpen(false)
    setMemberFormMessage({ type: 'success', text: 'Member added successfully.' })
    setIsMemberSaving(false)
    setMemberSaveStage('')
  }

  const handleRemoveMember = async (userId) => {
    if (session.user.id === userId) {
      setMemberActionMessage({ type: 'error', text: 'You cannot remove yourself as the trip owner.' })
      return
    }

    const confirmed = window.confirm('Are you sure you want to remove this member from the trip?')
    if (!confirmed) {
      return
    }

    setRemovingMemberId(userId)
    setMemberActionMessage({ type: '', text: '' })

    const { data: tripExpenses, error: expensesCheckError } = await supabase
      .from('expenses')
      .select('id, paid_by')
      .eq('trip_id', selectedTrip.id)

    if (expensesCheckError) {
      setMemberActionMessage({ type: 'error', text: 'We could not check this member’s expenses. Please try again.' })
      setRemovingMemberId('')
      return
    }

    const memberExpenses = (tripExpenses || []).filter((expense) => expense.paid_by === userId)
    const tripExpenseIds = (tripExpenses || []).map((expense) => expense.id)
    let memberSplits = []

    if (tripExpenseIds.length > 0) {
      const { data: splitData, error: splitsCheckError } = await supabase
        .from('expense_splits')
        .select('id')
        .in('expense_id', tripExpenseIds)
        .eq('user_id', userId)

      if (splitsCheckError) {
        setMemberActionMessage({ type: 'error', text: 'We could not check this member’s expense splits. Please try again.' })
        setRemovingMemberId('')
        return
      }

      memberSplits = splitData || []
    }

    if ((memberExpenses || []).length > 0 || memberSplits.length > 0) {
      setMemberActionMessage({
        type: 'error',
        text: 'This member cannot be removed because they are connected to existing expenses or expense splits.',
      })
      setRemovingMemberId('')
      return
    }

    const { error: removeError } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', selectedTrip.id)
      .eq('user_id', userId)

    if (removeError) {
      setMemberActionMessage({ type: 'error', text: 'We could not remove this member. Please try again.' })
      setRemovingMemberId('')
      return
    }

    const refreshed = await refreshTripMembers()
    if (!refreshed) {
      setMemberActionMessage({ type: 'error', text: 'The member was removed, but we could not refresh the member list.' })
    } else {
      setMemberActionMessage({ type: 'success', text: 'Member removed successfully.' })
    }
    setRemovingMemberId('')
  }

  const handleEditBudget = (member) => {
    setEditingMemberId(member.user_id)
    setEditBudgetValue(member.budget === null || member.budget === undefined ? '' : String(member.budget))
    setMemberActionMessage({ type: '', text: '' })
  }

  const handleCancelEditBudget = () => {
    if (!savingBudgetMemberId) {
      setEditingMemberId('')
      setEditBudgetValue('')
    }
  }

  const handleSaveBudget = async (event, memberId) => {
    event.preventDefault()
    setMemberActionMessage({ type: '', text: '' })

    const budget = Number(editBudgetValue)
    if (!editBudgetValue || Number.isNaN(budget) || budget <= 0) {
      setMemberActionMessage({ type: 'error', text: 'The budget must be a valid number greater than 0.' })
      return
    }

    setSavingBudgetMemberId(memberId)

    const { error } = await supabase
      .from('trip_members')
      .update({ budget })
      .eq('trip_id', selectedTrip.id)
      .eq('user_id', memberId)

    if (error) {
      setMemberActionMessage({ type: 'error', text: 'We could not update this member’s budget. Please try again.' })
      setSavingBudgetMemberId('')
      return
    }

    const refreshed = await refreshTripMembers()
    setSavingBudgetMemberId('')

    if (!refreshed) {
      setMemberActionMessage({ type: 'error', text: 'The budget was updated, but we could not refresh the member list.' })
      return
    }

    setEditingMemberId('')
    setEditBudgetValue('')
    setMemberActionMessage({ type: 'success', text: 'Budget updated successfully.' })
  }

  const openAddExpenseForm = () => {
    setEditingExpenseId('')
    clearExpenseForm()
    setExpenseFormMessage({ type: '', text: '' })
    setIsAddExpenseOpen(true)
  }

  const closeAddExpenseForm = () => {
    if (!isExpenseSaving) {
      setIsAddExpenseOpen(false)
      setExpenseFormMessage({ type: '', text: '' })
      setEditingExpenseId('')
    }
  }

  const handleExpenseInputChange = (event) => {
    const { name, value } = event.target
    setExpenseFormValues((currentValues) => ({ ...currentValues, [name]: value }))
    setExpenseFormMessage({ type: '', text: '' })
  }

  const clearExpenseForm = () => {
    setExpenseFormValues({
      description: '',
      amount: '',
      paidBy: '',
      sharedBy: [],
      category: 'Other',
    })
  }

  const handleSharedMemberChange = (event) => {
    const { value, checked } = event.target

    setExpenseFormValues((currentValues) => ({
      ...currentValues,
      sharedBy: checked
        ? [...currentValues.sharedBy, value]
        : currentValues.sharedBy.filter((userId) => userId !== value),
    }))
    setExpenseFormMessage({ type: '', text: '' })
  }

  const handleAddExpenseSubmit = async (event) => {
    event.preventDefault()
    setExpenseFormMessage({ type: '', text: '' })

    if (!expenseFormValues.description || !expenseFormValues.amount) {
      setExpenseFormMessage({ type: 'error', text: 'Please enter a description and amount.' })
      return
    }

    if (Number(expenseFormValues.amount) <= 0) {
      setExpenseFormMessage({ type: 'error', text: 'The amount must be greater than 0.' })
      return
    }

    if (!expenseFormValues.paidBy) {
      setExpenseFormMessage({ type: 'error', text: 'Please select the member who paid.' })
      return
    }

    if (expenseFormValues.sharedBy.length === 0) {
      setExpenseFormMessage({ type: 'error', text: 'Please select at least one member to share this expense.' })
      return
    }

    if (!expenseCategories.includes(expenseFormValues.category)) {
      setExpenseFormMessage({ type: 'error', text: 'Please select a valid expense category.' })
      return
    }

    setIsExpenseSaving(true)

    const { data: createdExpense, error } = await supabase
      .from('expenses')
      .insert({
        trip_id: selectedTrip.id,
        paid_by: expenseFormValues.paidBy,
        description: expenseFormValues.description.trim(),
        amount: Number(expenseFormValues.amount),
        category: expenseFormValues.category,
      })
      .select()
      .single()

    if (error) {
      setExpenseFormMessage({ type: 'error', text: 'We could not save this expense. Please try again.' })
      setIsExpenseSaving(false)
      return
    }

    const splitRows = createEqualSplitRows(
      createdExpense.id,
      Number(expenseFormValues.amount),
      expenseFormValues.sharedBy,
    )
    const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)

    if (splitError) {
      setExpenseFormMessage({
        type: 'error',
        text: 'The expense was created, but the split could not be saved. Please check the expense before continuing.',
      })
      setIsExpenseSaving(false)
      return
    }

    const refreshed = await refreshExpenses()
    if (!refreshed) {
      setExpensesError('The expense was added, but we could not refresh the expense list.')
    }

    clearExpenseForm()
    setIsAddExpenseOpen(false)
    setExpenseFormMessage({ type: 'success', text: 'Expense added successfully.' })
    setIsExpenseSaving(false)
  }

  const openEditExpenseForm = (expense) => {
    const sharedBy = expenseSplits
      .filter((split) => split.expense_id === expense.id)
      .map((split) => split.user_id)
      .filter((userId) => tripMembers.some((member) => member.user_id === userId))

    setEditingExpenseId(expense.id)
    setExpenseFormValues({
      description: expense.description || '',
      amount: expense.amount === null || expense.amount === undefined ? '' : String(expense.amount),
      paidBy: tripMembers.some((member) => member.user_id === expense.paid_by) ? expense.paid_by : '',
      sharedBy,
      category: expenseCategories.includes(expense.category) ? expense.category : 'Other',
    })
    setExpenseFormMessage({ type: '', text: '' })
    setIsAddExpenseOpen(true)
  }

  const handleEditExpenseSubmit = async (event) => {
    event.preventDefault()
    setExpenseFormMessage({ type: '', text: '' })

    const amount = Number(expenseFormValues.amount)
    const validMemberIds = new Set(tripMembers.map((member) => member.user_id))
    const selectedMembersAreValid = expenseFormValues.sharedBy.every((userId) => validMemberIds.has(userId))

    if (!expenseFormValues.description.trim() || !expenseFormValues.amount) {
      setExpenseFormMessage({ type: 'error', text: 'Please enter a description and amount.' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseFormMessage({ type: 'error', text: 'The amount must be a positive number.' })
      return
    }
    if (!expenseCategories.includes(expenseFormValues.category)) {
      setExpenseFormMessage({ type: 'error', text: 'Please select a valid expense category.' })
      return
    }
    if (!validMemberIds.has(expenseFormValues.paidBy)) {
      setExpenseFormMessage({ type: 'error', text: 'Please select a current trip member who paid.' })
      return
    }
    if (expenseFormValues.sharedBy.length === 0) {
      setExpenseFormMessage({ type: 'error', text: 'Please select at least one member to share this expense.' })
      return
    }
    if (!selectedMembersAreValid) {
      setExpenseFormMessage({ type: 'error', text: 'Shared members must belong to this trip.' })
      return
    }

    setIsExpenseSaving(true)
    const { error: updateError } = await supabase
      .from('expenses')
      .update({
        description: expenseFormValues.description.trim(),
        amount,
        category: expenseFormValues.category,
        paid_by: expenseFormValues.paidBy,
      })
      .eq('id', editingExpenseId)
      .eq('trip_id', selectedTrip.id)

    if (updateError) {
      setExpenseFormMessage({ type: 'error', text: 'We could not update this expense. Please try again.' })
      setIsExpenseSaving(false)
      return
    }

    const { error: deleteSplitsError } = await supabase
      .from('expense_splits')
      .delete()
      .eq('expense_id', editingExpenseId)

    if (deleteSplitsError) {
      await refreshExpenses()
      setExpenseFormMessage({
        type: 'error',
        text: 'The expense was updated, but its existing splits could not be replaced.',
      })
      setIsExpenseSaving(false)
      return
    }

    const splitRows = createEqualSplitRows(editingExpenseId, amount, expenseFormValues.sharedBy)
    const { error: insertSplitsError } = await supabase.from('expense_splits').insert(splitRows)

    if (insertSplitsError) {
      await refreshExpenses()
      setExpenseFormMessage({
        type: 'error',
        text: 'The expense was updated, but the new splits could not be saved.',
      })
      setIsExpenseSaving(false)
      return
    }

    const refreshed = await refreshExpenses()
    if (!refreshed) {
      setExpenseFormMessage({
        type: 'error',
        text: 'The expense was updated, but we could not refresh the expense data.',
      })
      setIsExpenseSaving(false)
      return
    }

    clearExpenseForm()
    setEditingExpenseId('')
    setIsAddExpenseOpen(false)
    setExpenseFormMessage({ type: 'success', text: 'Expense updated successfully.' })
    setIsExpenseSaving(false)
  }

  const handleDeleteExpense = async (expenseId) => {
    const confirmed = window.confirm('Are you sure you want to delete this expense? This will also remove its expense split.')
    if (!confirmed) {
      return
    }

    setDeletingExpenseId(expenseId)
    setExpenseFormMessage({ type: '', text: '' })

    const { error: deleteSplitsError } = await supabase
      .from('expense_splits')
      .delete()
      .eq('expense_id', expenseId)

    if (deleteSplitsError) {
      await refreshExpenses()
      setExpenseFormMessage({ type: 'error', text: 'We could not delete this expense’s splits, so the expense was kept.' })
      setDeletingExpenseId('')
      return
    }

    const { error: deleteExpenseError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('trip_id', selectedTrip.id)

    if (deleteExpenseError) {
      await refreshExpenses()
      setExpenseFormMessage({ type: 'error', text: 'The expense splits were removed, but the expense could not be deleted.' })
      setDeletingExpenseId('')
      return
    }

    const refreshed = await refreshExpenses()
    if (!refreshed) {
      setExpenseFormMessage({ type: 'error', text: 'The expense was deleted, but we could not refresh the expense data.' })
    } else {
      setExpenseFormMessage({ type: 'success', text: 'Expense deleted successfully.' })
    }
    setDeletingExpenseId('')
  }

  const openAddItineraryForm = () => {
    setEditingItineraryId('')
    setItineraryFormValues({
      title: '',
      description: '',
      activityDate: selectedTrip?.start_date || '',
      startTime: '',
      endTime: '',
      location: '',
    })
    setItineraryFormMessage({ type: '', text: '' })
    setIsItineraryFormOpen(true)
  }

  const openEditItineraryForm = (item) => {
    setEditingItineraryId(item.id)
    setItineraryFormValues({
      title: item.title || '',
      description: item.description || '',
      activityDate: item.activity_date || '',
      startTime: item.start_time ? item.start_time.slice(0, 5) : '',
      endTime: item.end_time ? item.end_time.slice(0, 5) : '',
      location: item.location || '',
    })
    setItineraryFormMessage({ type: '', text: '' })
    setIsItineraryFormOpen(true)
  }

  const closeItineraryForm = () => {
    if (!isItinerarySaving) {
      setIsItineraryFormOpen(false)
      setItineraryFormMessage({ type: '', text: '' })
      setEditingItineraryId('')
    }
  }

  const handleItineraryInputChange = (event) => {
    const { name, value } = event.target
    setItineraryFormValues((currentValues) => ({ ...currentValues, [name]: value }))
    setItineraryFormMessage({ type: '', text: '' })
  }

  const handleItinerarySubmit = async (event) => {
    event.preventDefault()
    setItineraryFormMessage({ type: '', text: '' })

    if (!itineraryFormValues.title.trim()) {
      setItineraryFormMessage({ type: 'error', text: 'Please enter an activity title.' })
      return
    }

    if (!itineraryFormValues.activityDate) {
      setItineraryFormMessage({ type: 'error', text: 'Please choose an activity date.' })
      return
    }

    if (
      itineraryFormValues.startTime &&
      itineraryFormValues.endTime &&
      itineraryFormValues.endTime <= itineraryFormValues.startTime
    ) {
      setItineraryFormMessage({ type: 'error', text: 'The end time must be later than the start time.' })
      return
    }

    setIsItinerarySaving(true)
    const itineraryData = {
      trip_id: selectedTrip.id,
      title: itineraryFormValues.title.trim(),
      description: itineraryFormValues.description.trim() || null,
      activity_date: itineraryFormValues.activityDate,
      start_time: itineraryFormValues.startTime || null,
      end_time: itineraryFormValues.endTime || null,
      location: itineraryFormValues.location.trim() || null,
    }

    const result = editingItineraryId
      ? await supabase
        .from('itinerary_items')
        .update(itineraryData)
        .eq('id', editingItineraryId)
        .eq('trip_id', selectedTrip.id)
      : await supabase.from('itinerary_items').insert(itineraryData)

    if (result.error) {
      setItineraryFormMessage({
        type: 'error',
        text: `We could not ${editingItineraryId ? 'update' : 'save'} this activity. Please try again.`,
      })
      setIsItinerarySaving(false)
      return
    }

    const refreshed = await refreshItinerary()
    if (!refreshed) {
      setItineraryFormMessage({
        type: 'error',
        text: `The activity was ${editingItineraryId ? 'updated' : 'added'}, but we could not refresh the itinerary.`,
      })
      setIsItinerarySaving(false)
      return
    }

    setItineraryFormValues({
      title: '',
      description: '',
      activityDate: '',
      startTime: '',
      endTime: '',
      location: '',
    })
    setIsItineraryFormOpen(false)
    setEditingItineraryId('')
    setItineraryFormMessage({
      type: 'success',
      text: editingItineraryId ? 'Activity updated successfully.' : 'Activity added successfully.',
    })
    setIsItinerarySaving(false)
  }

  const handleDeleteItineraryItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this activity?')) {
      return
    }

    setDeletingItineraryId(itemId)
    setItineraryFormMessage({ type: '', text: '' })

    const { error } = await supabase
      .from('itinerary_items')
      .delete()
      .eq('id', itemId)
      .eq('trip_id', selectedTrip.id)

    if (error) {
      setItineraryFormMessage({ type: 'error', text: 'We could not delete this activity. Please try again.' })
      setDeletingItineraryId('')
      return
    }

    const refreshed = await refreshItinerary()
    if (!refreshed) {
      setItineraryFormMessage({ type: 'error', text: 'The activity was deleted, but we could not refresh the itinerary.' })
    } else {
      setItineraryFormMessage({ type: 'success', text: 'Activity deleted successfully.' })
    }
    setDeletingItineraryId('')
  }

  const openTripForm = () => {
    if (!session) {
      openAuth()
      return
    }

    setTripFormMessage('')
    setTripSuccessMessage('')
    setIsTripFormOpen(true)
  }

  const closeTripForm = () => {
    if (!isTripSaving) {
      setIsTripFormOpen(false)
      setTripFormMessage('')
    }
  }

  const handleTripInputChange = (event) => {
    const { name, value } = event.target
    setTripFormValues((currentValues) => ({ ...currentValues, [name]: value }))
    setTripFormMessage('')
  }

  const clearTripForm = () => {
    setTripFormValues({
      name: '',
      destination: '',
      startDate: '',
      endDate: '',
    })
  }

  const handleTripSubmit = async (event) => {
    event.preventDefault()
    setTripFormMessage('')

    if (tripFormValues.startDate > tripFormValues.endDate) {
      setTripFormMessage('The start date must be on or before the end date.')
      return
    }

    setIsTripSaving(true)

    const { error } = await supabase.from('trips').insert({
      name: tripFormValues.name,
      destination: tripFormValues.destination,
      start_date: tripFormValues.startDate,
      end_date: tripFormValues.endDate,
      created_by: session.user.id,
    })

    if (error) {
      setTripFormMessage('We could not save your trip. Please check your details and try again.')
      setIsTripSaving(false)
      return
    }

    clearTripForm()
    setIsTripFormOpen(false)
    setTripSuccessMessage('Your trip was created successfully.')
    setIsTripSaving(false)

    await refreshTrips()
  }

  const userName = session?.user?.user_metadata?.full_name
  const userLabel = userName || session?.user?.email
  const dashboardName = userName || session?.user?.email || 'there'
  const dashboardTripStatuses = trips.map((trip) => getTripStatus(trip))
  const dashboardStats = {
    total: trips.length,
    upcoming: dashboardTripStatuses.filter((status) => status.key === 'upcoming').length,
    completed: dashboardTripStatuses.filter((status) => status.key === 'completed').length,
  }
  const budgetSummaries = tripMembers.map((member) => {
    const budget = Number(member.budget || 0)
    const paid = expenses
      .filter((expense) => expense.paid_by === member.user_id)
      .reduce((total, expense) => total + Number(expense.amount || 0), 0)
    const owed = expenseSplits
      .filter((split) => split.user_id === member.user_id)
      .reduce((total, split) => total + Number(split.amount_owed || 0), 0)

    return {
      userId: member.user_id,
      label: getMemberLabel(member.user_id, tripMembers, profiles),
      budget,
      paid,
      owed,
      netBalance: paid - owed,
      remaining: budget - owed,
      percentage: budget > 0 ? (owed / budget) * 100 : 0,
    }
  })
  const totalTripBudget = budgetSummaries.reduce((total, member) => total + member.budget, 0)
  const totalTripSpending = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const totalTripAllocated = expenseSplits.reduce((total, split) => total + Number(split.amount_owed || 0), 0)
  const totalTripRemaining = totalTripBudget - totalTripAllocated
  const spendingInsights = useMemo(() => {
    const categoryTotalsByName = expenseCategories.reduce((totals, category) => ({
      ...totals,
      [category]: 0,
    }), {})

    const totalSpending = expenses.reduce((total, expense) => {
      const amount = Number(expense.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return total
      }

      const category = expenseCategories.includes(expense.category)
        ? expense.category
        : 'Other'
      categoryTotalsByName[category] += amount
      return total + amount
    }, 0)

    const categoryTotals = expenseCategories.map((category) => ({
      category,
      total: categoryTotalsByName[category],
      percentage: totalSpending > 0
        ? (categoryTotalsByName[category] / totalSpending) * 100
        : 0,
    }))
    const largestCategory = totalSpending > 0
      ? categoryTotals.reduce((largest, current) => (
        current.total > largest.total ? current : largest
      ))
      : null

    return {
      categoryTotals,
      totalSpending,
      largestCategory,
    }
  }, [expenses])
  const settlementResult = calculateSettlements(budgetSummaries)
  const tripHealth = calculateTripHealth(
    totalTripBudget,
    spendingInsights.totalSpending,
    spendingInsights.largestCategory,
  )
  const itineraryGroups = itineraryItems.reduce((groups, item) => {
    const dateKey = item.activity_date || 'unknown'
    const existingGroup = groups.find((group) => group.date === dateKey)

    if (existingGroup) {
      existingGroup.items.push(item)
      return groups
    }

    return [...groups, { date: dateKey, items: [item] }]
  }, [])
  const tripDuration = getTripDuration(selectedTrip?.start_date, selectedTrip?.end_date)
  const overviewCategories = spendingInsights.categoryTotals
    .filter((categoryTotal) => categoryTotal.total > 0)
    .sort((first, second) => second.total - first.total)
    .slice(0, 3)
  const sortedOverviewActivities = [...itineraryItems]
    .filter((item) => isValidDateOnly(item.activity_date))
    .sort((first, second) => {
      const dateDifference = first.activity_date.localeCompare(second.activity_date)
      if (dateDifference !== 0) {
        return dateDifference
      }
      return (first.start_time || '99:99').localeCompare(second.start_time || '99:99')
    })
  const todayDateOnly = getTodayDateOnly()
  const upcomingActivities = sortedOverviewActivities.filter((item) => item.activity_date >= todayDateOnly)
  const overviewActivities = (upcomingActivities.length > 0
    ? upcomingActivities.slice(0, 3)
    : sortedOverviewActivities.slice(-3).reverse())

  return (
    <div className="app">
      <header className="site-header">
        <nav className="navigation container" aria-label="Main navigation">
          <a className="brand" href="/" aria-label="GroupTrip Planner home">
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>GroupTrip Planner</span>
          </a>

          <div className="nav-links">
            <a className="nav-link active" href="/">Home</a>
            <a className="nav-link" href="#my-trips">My Trips</a>
            {session ? (
              <>
                <span className="user-label" title={session.user.email}>{userLabel}</span>
                <button className="login-button" type="button" onClick={handleLogout} disabled={isLogoutLoading}>
                  {isLogoutLoading ? 'Signing out…' : 'Logout'}
                </button>
              </>
            ) : (
              <button className="login-button" type="button" onClick={() => openAuth()}>Login</button>
            )}
          </div>
        </nav>
      </header>

      <main>
        <section className="hero container">
          <div className="hero-content">
            <p className="eyebrow">Travel planning, made simple</p>
            <h1>Plan Together.<br /><span>Spend Smarter.</span></h1>
            <p className="hero-description">
              GroupTrip Planner helps groups organise trips, manage activities
              and stay within everyone&apos;s individual budget.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={openTripForm}>Create a Trip <span aria-hidden="true">→</span></button>
              <button className="secondary-button" type="button">Explore Trips</button>
            </div>
          </div>

          <div className="hero-illustration" aria-hidden="true">
            <div className="sun"></div>
            <div className="illustration-card card-main">
              <span className="card-label">NEXT ADVENTURE</span>
              <strong>Plan your<br />perfect escape.</strong>
              <span className="card-line"></span>
              <span className="card-detail">Everyone&apos;s invited</span>
            </div>
            <div className="illustration-card card-small">
              <span className="mini-icon">✓</span>
              <span><strong>Budget on track</strong><small>Looking good!</small></span>
            </div>
            <span className="sparkle sparkle-one">✦</span>
            <span className="sparkle sparkle-two">✦</span>
          </div>
        </section>

        {session && (
          <section className="trips-section" id="my-trips">
            <div className="container">
              <div className="dashboard-welcome">
                <div>
                  <p className="eyebrow">Your dashboard</p>
                  <h2>Welcome back, {dashboardName} <span aria-hidden="true">👋</span></h2>
                  <p>Plan your next group adventure.</p>
                </div>
                <button className="primary-button" type="button" onClick={openTripForm}>
                  Create Trip <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="dashboard-stats" aria-label="Trip statistics">
                <div className="dashboard-stat-card">
                  <span>Total Trips</span>
                  <strong>{dashboardStats.total}</strong>
                  <small>Your travel plans</small>
                </div>
                <div className="dashboard-stat-card">
                  <span>Upcoming</span>
                  <strong>{dashboardStats.upcoming}</strong>
                  <small>Adventures ahead</small>
                </div>
                <div className="dashboard-stat-card">
                  <span>Completed</span>
                  <strong>{dashboardStats.completed}</strong>
                  <small>Trips you have taken</small>
                </div>
              </div>
              <div className="trips-heading">
                <div>
                  <p className="eyebrow">Your travel plans</p>
                  <h2>Your <span>trips.</span></h2>
                  <p className="trips-subheading">Keep your plans, people, and budgets together.</p>
                </div>
                <button className="secondary-button" type="button" onClick={openTripForm}>Create another trip</button>
              </div>
              {tripSuccessMessage && <p className="trip-success" role="status">{tripSuccessMessage}</p>}
              {isTripsLoading && <p className="loading-state" role="status">Loading your trips…</p>}
              {!isTripsLoading && tripsError && (
                <div className="inline-error">
                  <p className="trips-status trips-error" role="alert">{tripsError}</p>
                  <button className="retry-button" type="button" onClick={refreshTrips}>Try again</button>
                </div>
              )}
              {!isTripsLoading && !tripsError && trips.length === 0 && (
                <div className="trips-empty-state">
                  <div className="empty-state-icon" aria-hidden="true">✦</div>
                  <h3>No trips yet</h3>
                  <p>Start planning your next adventure with your group.</p>
                  <button className="primary-button" type="button" onClick={openTripForm}>Create your first trip</button>
                </div>
              )}
              {!isTripsLoading && !tripsError && trips.length > 0 && (
                <div className="trips-grid">
                  {trips.map((trip) => {
                    const tripStatus = getTripStatus(trip)
                    const tripDuration = getTripDuration(trip.start_date, trip.end_date)

                    return (
                    <article
                      className="trip-card"
                      key={trip.id}
                      role="button"
                      tabIndex="0"
                      onClick={() => openTripDetails(trip)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openTripDetails(trip)
                        }
                      }}
                    >
                      <div className="trip-card-header">
                        <span className={`trip-status-badge trip-status-${tripStatus.key}`}>{tripStatus.label}</span>
                        <span className="trip-card-arrow" aria-hidden="true">↗</span>
                      </div>
                      <h3>{trip.name}</h3>
                      <p className="trip-destination">{trip.destination}</p>
                      <p className="trip-dates">{formatTripDate(trip.start_date)} <span aria-hidden="true">→</span> {formatTripDate(trip.end_date)}</p>
                      {tripDuration && <p className="trip-duration">{tripDuration} {tripDuration === 1 ? 'day' : 'days'}</p>}
                      <span className="trip-card-footer">View trip <span aria-hidden="true">→</span></span>
                    </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="features-section" id="trips">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Everything in one place</p>
              <h2>Make every trip a<br /><span>shared success.</span></h2>
            </div>
            <div className="features-grid">
              {features.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-icon" aria-hidden="true">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-content">
          <a className="brand" href="/" aria-label="GroupTrip Planner home">
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>GroupTrip Planner</span>
          </a>
          <p>Plan trips together, without the budget stress.</p>
        </div>
      </footer>

      {selectedTrip && (
        <div className="auth-backdrop" role="presentation" onMouseDown={closeTripDetails}>
          <section
            className="auth-modal trip-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-details-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="close-button" type="button" aria-label="Close trip details" onClick={closeTripDetails}>×</button>
            <button className="back-button" type="button" onClick={closeTripDetails}>← Back to My Trips</button>
            <p className="eyebrow">Trip details</p>
            <h2 id="trip-details-title">{selectedTrip.name}</h2>
            <div className="trip-summary">
              <p className="trip-destination">{selectedTrip.destination}</p>
              <p className="trip-dates">{formatTripDateRange(selectedTrip.start_date, selectedTrip.end_date)}</p>
            </div>

            <div className="trip-overview">
              <div className="trip-overview-header">
                <div>
                  <p className="eyebrow">Your trip at a glance</p>
                  <h3>Trip Overview</h3>
                  <p>{formatTripDateRange(selectedTrip.start_date, selectedTrip.end_date)} · {tripDuration ? `${tripDuration} days` : 'Duration unavailable'} · {tripMembers.length} {tripMembers.length === 1 ? 'traveller' : 'travellers'}</p>
                </div>
                <span className="trip-overview-icon" aria-hidden="true">✦</span>
              </div>

              <div className="trip-overview-stats">
                <div className="trip-overview-stat">
                  <span>Budget</span>
                  <strong>{formatCurrency(totalTripBudget)}</strong>
                  <small>Total trip budget</small>
                </div>
                <div className="trip-overview-stat">
                  <span>Spent</span>
                  <strong>{formatCurrency(spendingInsights.totalSpending)}</strong>
                  <small>Total trip spending</small>
                </div>
                <div className="trip-overview-stat">
                  <span>Activities</span>
                  <strong>{itineraryItems.length}</strong>
                  <small>Planned activities</small>
                </div>
                <div className="trip-overview-stat">
                  <span>Travellers</span>
                  <strong>{tripMembers.length}</strong>
                  <small>Trip members</small>
                </div>
              </div>

              <div className={`overview-health overview-health-${tripHealth.status}`}>
                <div className="overview-health-heading">
                  <div>
                    <span className="overview-card-label">Trip Health</span>
                    <strong>{tripHealth.label}</strong>
                  </div>
                  {tripHealth.status !== 'none' && <span>{Math.round(tripHealth.usagePercentage)}% spent</span>}
                </div>
                <p>
                  {tripHealth.status === 'good'
                    ? 'You’re comfortably within budget.'
                    : tripHealth.status === 'watch'
                      ? 'You’re getting close to your budget.'
                      : tripHealth.status === 'over'
                        ? 'You’ve exceeded your planned budget.'
                        : 'Set member budgets to track your trip health.'}
                </p>
                {tripHealth.status !== 'none' && (
                  <div className="overview-health-bar">
                    <span style={{ width: `${Math.min(Math.max(tripHealth.usagePercentage, 0), 100)}%` }}></span>
                  </div>
                )}
                <small>
                  {tripHealth.status === 'over'
                    ? `${formatCurrency(Math.abs(tripHealth.remaining))} over budget`
                    : tripHealth.status === 'none'
                      ? 'No budget set'
                      : `${formatCurrency(Math.max(tripHealth.remaining, 0))} remaining`}
                </small>
              </div>

              <div className="trip-overview-grid">
                <div className="overview-preview-card">
                  <div className="overview-preview-heading">
                    <h4>Spending preview</h4>
                    <button type="button" onClick={() => document.getElementById('spending-insights')?.scrollIntoView({ behavior: 'smooth' })}>View full insights</button>
                  </div>
                  {overviewCategories.length === 0 ? (
                    <p className="overview-empty-text">No spending recorded yet.</p>
                  ) : (
                    <div className="overview-category-list">
                      {overviewCategories.map((categoryTotal) => (
                        <div className="overview-category-row" key={categoryTotal.category}>
                          <span>{categoryTotal.category}</span>
                          <strong>{formatCurrency(categoryTotal.total)}</strong>
                          <small>{Math.round(categoryTotal.percentage)}%</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overview-preview-card">
                  <div className="overview-preview-heading">
                    <h4>Upcoming itinerary</h4>
                  </div>
                  {overviewActivities.length === 0 ? (
                    <p className="overview-empty-text">No activities planned yet.</p>
                  ) : (
                    <div className="overview-activity-list">
                      {overviewActivities.map((item) => (
                        <div className="overview-activity-row" key={item.id}>
                          <small>
                            {formatOverviewDate(item.activity_date)}
                            {formatItineraryTime(item.start_time) && ` · ${formatItineraryTime(item.start_time)}`}
                          </small>
                          <strong>{item.title}</strong>
                          {item.location && <span>📍 {item.location}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overview-preview-card">
                  <div className="overview-preview-heading">
                    <h4>Settlement</h4>
                  </div>
                  {settlementResult.hasSignificantDifference ? (
                    <p className="overview-warning">Settlement totals need checking.</p>
                  ) : settlementResult.settlements.length === 0 ? (
                    <p className="overview-empty-text">Everyone is settled 🎉</p>
                  ) : (
                    <div className="overview-settlement-list">
                      {settlementResult.settlements.slice(0, 3).map((settlement, index) => (
                        <div className="overview-settlement-row" key={`${settlement.from}-${settlement.to}-${index}`}>
                          <span>{settlement.from} <b aria-hidden="true">→</b> {settlement.to}</span>
                          <strong>{formatCurrency(settlement.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`trip-health trip-health-${tripHealth.status}`}>
              <div className="trip-health-heading">
                <h3>Trip Health</h3>
                <span className="trip-health-badge">{tripHealth.label}</span>
              </div>
              <p className="trip-health-explanation">{tripHealth.explanation}</p>
              {tripHealth.status !== 'none' && (
                <>
                  <div className="trip-health-usage">
                    <span>{Math.round(tripHealth.usagePercentage)}% of group budget used</span>
                    <span>{tripHealth.remaining >= 0 ? formatCurrency(tripHealth.remaining) : `${formatCurrency(Math.abs(tripHealth.remaining))} over budget`}</span>
                  </div>
                  <div
                    className="trip-health-progress"
                    role="progressbar"
                    aria-label={`${Math.round(tripHealth.usagePercentage)}% of group budget used`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={Math.min(Math.max(tripHealth.usagePercentage, 0), 100)}
                  >
                    <span style={{ width: `${Math.min(Math.max(tripHealth.usagePercentage, 0), 100)}%` }}></span>
                  </div>
                </>
              )}
              {tripHealth.supportingMessages.length > 0 && (
                <div className="trip-health-supporting">
                  {tripHealth.supportingMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="budget-summary">
              <div className="budget-summary-heading">
                <h3>Budget Summary</h3>
              </div>
              {budgetSummaries.length === 0 ? (
                <p className="trips-status">Add members to see the budget summary.</p>
              ) : (
                <>
                  <div className="budget-total-row">
                    <div>
                      <span>Total Trip Budget</span>
                      <strong>{formatCurrency(totalTripBudget)}</strong>
                    </div>
                    <div>
                      <span>Total Trip Spending</span>
                      <strong>{formatCurrency(totalTripSpending)}</strong>
                    </div>
                    <div>
                      <span>Total Allocated/Owed</span>
                      <strong>{formatCurrency(totalTripAllocated)}</strong>
                    </div>
                    <div className={totalTripRemaining < 0 ? 'over-budget' : ''}>
                      <span>Total Remaining</span>
                      <strong>{formatCurrency(totalTripRemaining)}</strong>
                    </div>
                  </div>
                  <div className="budget-list">
                    {budgetSummaries.map((member) => {
                      const isOverBudget = member.remaining < 0
                      const progressWidth = Math.min(member.percentage, 100)

                      return (
                        <div className={`budget-row ${isOverBudget ? 'over-budget' : ''}`} key={member.userId}>
                          <div className="budget-row-heading">
                            <strong>{member.label}</strong>
                            {isOverBudget && <span className="over-budget-label">Over budget</span>}
                          </div>
                          <div className="budget-values">
                            <span>Budget: {formatCurrency(member.budget)}</span>
                            <span>Paid: {formatCurrency(member.paid)}</span>
                            <span>Owed: {formatCurrency(member.owed)}</span>
                            <span className={member.netBalance > 0 ? 'balance-positive' : member.netBalance < 0 ? 'balance-negative' : ''}>
                              Net: {member.netBalance > 0 ? '+' : ''}{formatCurrency(member.netBalance)}
                            </span>
                            <span>Remaining: {formatCurrency(member.remaining)}</span>
                          </div>
                          <div className="budget-progress" aria-label={`${Math.round(member.percentage)}% of budget spent`}>
                            <span style={{ width: `${progressWidth}%` }}></span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="itinerary-section">
              <div className="itinerary-heading">
                <div>
                  <h3>Itinerary</h3>
                  <p>Plan the activities that will make your trip memorable.</p>
                </div>
                <button className="secondary-button" type="button" onClick={openAddItineraryForm}>Add Activity</button>
              </div>
              {itineraryFormMessage.text && !isItineraryFormOpen && (
                <p className={`auth-message ${itineraryFormMessage.type} itinerary-message`} role="status">
                  {itineraryFormMessage.text}
                </p>
              )}
              {isItineraryFormOpen && (
                <form className="itinerary-form" onSubmit={handleItinerarySubmit}>
                  <div className="itinerary-form-grid">
                    <label>
                      Activity title
                      <input name="title" type="text" value={itineraryFormValues.title} onChange={handleItineraryInputChange} required />
                    </label>
                    <label>
                      Date
                      <input
                        name="activityDate"
                        type="date"
                        value={itineraryFormValues.activityDate}
                        onChange={handleItineraryInputChange}
                        required
                      />
                    </label>
                    <label>
                      Start time
                      <input name="startTime" type="time" value={itineraryFormValues.startTime} onChange={handleItineraryInputChange} />
                    </label>
                    <label>
                      End time
                      <input name="endTime" type="time" value={itineraryFormValues.endTime} onChange={handleItineraryInputChange} />
                    </label>
                    <label>
                      Location
                      <input name="location" type="text" value={itineraryFormValues.location} onChange={handleItineraryInputChange} />
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea name="description" value={itineraryFormValues.description} onChange={handleItineraryInputChange} rows="3" />
                  </label>
                  {itineraryFormMessage.text && (
                    <p className={`auth-message ${itineraryFormMessage.type}`} role="alert">{itineraryFormMessage.text}</p>
                  )}
                  <div className="member-form-actions">
                    <button className="auth-submit" type="submit" disabled={isItinerarySaving}>
                      {isItinerarySaving
                        ? editingItineraryId ? 'Saving activity…' : 'Adding activity…'
                        : editingItineraryId ? 'Save changes' : 'Add activity'}
                    </button>
                    <button className="cancel-button" type="button" onClick={closeItineraryForm} disabled={isItinerarySaving}>Cancel</button>
                  </div>
                </form>
              )}
              {isItineraryLoading && <p className="loading-state" role="status">Loading itinerary…</p>}
              {!isItineraryLoading && itineraryError && (
                <div className="inline-error">
                  <p className="trips-status trips-error" role="alert">{itineraryError}</p>
                  <button className="retry-button" type="button" onClick={retryTripDetails}>Try again</button>
                </div>
              )}
              {!isItineraryLoading && !itineraryError && itineraryItems.length === 0 && (
                <div className="itinerary-empty-state">
                  <strong>No activities planned yet.</strong>
                  <p>Start building your trip itinerary.</p>
                  <button className="secondary-button" type="button" onClick={openAddItineraryForm}>Add Activity</button>
                </div>
              )}
              {!isItineraryLoading && !itineraryError && itineraryItems.length > 0 && (
                <div className="itinerary-days">
                  {itineraryGroups.map((group) => {
                    const dayNumber = getItineraryDayNumber(selectedTrip.start_date, group.date)

                    return (
                      <div className="itinerary-day" key={group.date}>
                        <div className="itinerary-day-heading">
                          <span>{dayNumber ? `Day ${dayNumber}` : 'Additional date'}</span>
                          <strong>{formatItineraryDate(group.date)}</strong>
                        </div>
                        <div className="itinerary-activities">
                          {group.items.map((item) => (
                            <article className="itinerary-activity" key={item.id}>
                              <div className="itinerary-activity-marker" aria-hidden="true"></div>
                              <div className="itinerary-activity-content">
                                {formatItineraryTime(item.start_time) && (
                                  <span className="itinerary-time">
                                    {formatItineraryTime(item.start_time)}
                                    {formatItineraryTime(item.end_time) && ` – ${formatItineraryTime(item.end_time)}`}
                                  </span>
                                )}
                                <h4>{item.title}</h4>
                                {item.location && <p className="itinerary-location">📍 {item.location}</p>}
                                {item.description && <p className="itinerary-description">{item.description}</p>}
                                <div className="itinerary-actions">
                                  <button type="button" onClick={() => openEditItineraryForm(item)} disabled={deletingItineraryId !== ''}>Edit</button>
                                  <button type="button" onClick={() => handleDeleteItineraryItem(item.id)} disabled={deletingItineraryId !== ''}>
                                    {deletingItineraryId === item.id ? 'Deleting…' : 'Delete'}
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="spending-insights" id="spending-insights">
              <div className="spending-insights-heading">
                <div>
                  <h3>Spending Insights</h3>
                  <p>See how your trip spending is distributed.</p>
                </div>
                <strong>{formatCurrency(spendingInsights.totalSpending)}</strong>
              </div>
              {spendingInsights.totalSpending === 0 ? (
                <p className="trips-status">Add expenses to see spending insights.</p>
              ) : (
                <>
                  <div className="biggest-category">
                    <span>Biggest category</span>
                    <strong>{spendingInsights.largestCategory.category}</strong>
                    <p>
                      {spendingInsights.largestCategory.category} is your biggest expense category at{' '}
                      {formatCurrency(spendingInsights.largestCategory.total)} (
                      {Math.round(spendingInsights.largestCategory.percentage)}% of total spending).
                    </p>
                  </div>
                  <div className="category-insights-list">
                    {spendingInsights.categoryTotals.map((categoryTotal) => (
                      <div className="category-insight-row" key={categoryTotal.category}>
                        <div className="category-insight-heading">
                          <span>{categoryTotal.category}</span>
                          <span>
                            {formatCurrency(categoryTotal.total)} · {Math.round(categoryTotal.percentage)}%
                          </span>
                        </div>
                        <div
                          className="category-progress"
                          role="progressbar"
                          aria-label={`${categoryTotal.category}: ${Math.round(categoryTotal.percentage)}% of spending`}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-valuenow={Math.round(categoryTotal.percentage)}
                        >
                          <span style={{ width: `${Math.min(Math.max(categoryTotal.percentage, 0), 100)}%` }}></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="settlement-section">
              <div className="settlement-heading">
                <h3>Settlement</h3>
              </div>
              {settlementResult.hasSignificantDifference ? (
                <p className="settlement-warning" role="alert">
                  Settlement totals do not balance. Please check the expense splits.
                </p>
              ) : settlementResult.settlements.length === 0 ? (
                <p className="trips-status">Everyone is settled up.</p>
              ) : (
                <div className="settlement-list">
                  {settlementResult.settlements.map((settlement, index) => (
                    <div className="settlement-row" key={`${settlement.from}-${settlement.to}-${index}`}>
                      <span>{settlement.from} <span aria-hidden="true">→</span> {settlement.to}</span>
                      <strong>{formatCurrency(settlement.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="members-heading">
              <h3>Trip Members</h3>
              <button className="secondary-button" type="button" onClick={openAddMemberForm}>Add Member</button>
            </div>
            {memberActionMessage.text && (
              <p className={`auth-message ${memberActionMessage.type} member-action-message`} role="alert">
                {memberActionMessage.text}
              </p>
            )}
            {isAddMemberOpen && (
              <form className="member-form" onSubmit={handleAddMemberSubmit}>
                <label>
                  Member email
                  <input name="email" type="email" value={memberFormValues.email} onChange={handleMemberInputChange} required />
                </label>
                <label>
                  Budget
                  <input name="budget" type="number" min="0.01" step="0.01" value={memberFormValues.budget} onChange={handleMemberInputChange} required />
                </label>
                {memberFormMessage.text && (
                  <p className={`auth-message ${memberFormMessage.type}`} role="alert">{memberFormMessage.text}</p>
                )}
                <div className="member-form-actions">
                  <button className="auth-submit" type="submit" disabled={isMemberSaving}>
                    {isMemberSaving
                      ? memberSaveStage === 'finding' ? 'Finding member…' : 'Adding member…'
                      : 'Add member'}
                  </button>
                  <button className="cancel-button" type="button" onClick={closeAddMemberForm} disabled={isMemberSaving}>Cancel</button>
                </div>
              </form>
            )}
            {!isAddMemberOpen && memberFormMessage.type === 'success' && (
              <p className="auth-message success member-success" role="status">{memberFormMessage.text}</p>
            )}
            {isMembersLoading && <p className="loading-state" role="status">Loading trip details…</p>}
            {!isMembersLoading && membersError && (
              <div className="inline-error">
                <p className="trips-status trips-error" role="alert">{membersError}</p>
                <button className="retry-button" type="button" onClick={retryTripDetails}>Try again</button>
              </div>
            )}
            {!isMembersLoading && !membersError && tripMembers.length === 0 && (
              <p className="trips-status">No members added yet.</p>
            )}
            {!isMembersLoading && !membersError && tripMembers.length > 0 && (
              <div className="members-list">
                {tripMembers.map((member) => (
                  <div className="member-row" key={member.user_id}>
                    <div className="member-details">
                      <span className="member-id">{getMemberLabel(member.user_id, tripMembers, profiles)}</span>
                      {editingMemberId === member.user_id ? (
                        <form className="budget-edit-form" onSubmit={(event) => handleSaveBudget(event, member.user_id)}>
                          <input
                            aria-label={`Budget for ${getMemberLabel(member.user_id, tripMembers, profiles)}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editBudgetValue}
                            onChange={(event) => setEditBudgetValue(event.target.value)}
                            required
                            disabled={savingBudgetMemberId === member.user_id}
                          />
                          <div className="budget-edit-actions">
                            <button className="save-budget-button" type="submit" disabled={savingBudgetMemberId === member.user_id}>
                              {savingBudgetMemberId === member.user_id ? 'Saving…' : 'Save'}
                            </button>
                            <button className="cancel-button" type="button" onClick={handleCancelEditBudget} disabled={savingBudgetMemberId === member.user_id}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <span className="member-budget">
                          {member.budget === null || member.budget === undefined ? 'Budget not set' : `Budget: ${member.budget}`}
                        </span>
                      )}
                    </div>
                    {session.user.id !== member.user_id && (
                      <div className="member-row-actions">
                        {editingMemberId !== member.user_id && (
                          <button
                            className="edit-budget-button"
                            type="button"
                            onClick={() => handleEditBudget(member)}
                            disabled={removingMemberId !== '' || savingBudgetMemberId !== ''}
                          >
                            Edit Budget
                          </button>
                        )}
                        <button
                          className="remove-member-button"
                          type="button"
                          onClick={() => handleRemoveMember(member.user_id)}
                          disabled={removingMemberId !== '' && removingMemberId !== member.user_id || savingBudgetMemberId !== ''}
                        >
                          {removingMemberId === member.user_id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="expenses-heading">
              <h3>Expenses</h3>
              <button className="secondary-button" type="button" onClick={openAddExpenseForm}>Add Expense</button>
            </div>
            {isAddExpenseOpen && (
              <form className="expense-form" onSubmit={editingExpenseId ? handleEditExpenseSubmit : handleAddExpenseSubmit}>
                <p className="expense-form-title">{editingExpenseId ? 'Edit expense' : 'Add an expense'}</p>
                <label>
                  Expense description
                  <input name="description" type="text" value={expenseFormValues.description} onChange={handleExpenseInputChange} required />
                </label>
                <label>
                  Amount
                  <input name="amount" type="number" min="0.01" step="0.01" value={expenseFormValues.amount} onChange={handleExpenseInputChange} required />
                </label>
                <label>
                  Paid by
                  <select name="paidBy" value={expenseFormValues.paidBy} onChange={handleExpenseInputChange} required disabled={tripMembers.length === 0}>
                    <option value="">Select a member</option>
                    {tripMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>{getMemberLabel(member.user_id, tripMembers, profiles)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select name="category" value={expenseFormValues.category} onChange={handleExpenseInputChange} required>
                    {expenseCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="shared-by-fieldset">
                  <legend>Shared by</legend>
                  <div className="shared-by-list">
                    {tripMembers.map((member) => (
                      <label className="shared-by-option" key={member.user_id}>
                        <input
                          type="checkbox"
                          value={member.user_id}
                          checked={expenseFormValues.sharedBy.includes(member.user_id)}
                          onChange={handleSharedMemberChange}
                        />
                        <span>{getMemberLabel(member.user_id, tripMembers, profiles)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {tripMembers.length === 0 && <p className="form-hint">Add a trip member before recording an expense.</p>}
                {expenseFormMessage.text && (
                  <p className={`auth-message ${expenseFormMessage.type}`} role="alert">{expenseFormMessage.text}</p>
                )}
                <div className="member-form-actions">
                  <button className="auth-submit" type="submit" disabled={isExpenseSaving || tripMembers.length === 0}>
                    {isExpenseSaving ? 'Saving expense…' : editingExpenseId ? 'Save changes' : 'Add expense'}
                  </button>
                  <button className="cancel-button" type="button" onClick={closeAddExpenseForm} disabled={isExpenseSaving}>Cancel</button>
                </div>
              </form>
            )}
            {!isAddExpenseOpen && expenseFormMessage.type === 'success' && (
              <p className="auth-message success member-success" role="status">{expenseFormMessage.text}</p>
            )}
            {isExpensesLoading && <p className="loading-state" role="status">Loading expenses…</p>}
            {!isExpensesLoading && expensesError && (
              <div className="inline-error">
                <p className="trips-status trips-error" role="alert">{expensesError}</p>
                <button className="retry-button" type="button" onClick={retryTripDetails}>Try again</button>
              </div>
            )}
            {!isExpensesLoading && !expensesError && expenses.length === 0 && (
              <div className="section-empty-state">
                <strong>No expenses yet.</strong>
                <p>Add your first expense to start tracking spending.</p>
              </div>
            )}
            {!isExpensesLoading && !expensesError && expenses.length > 0 && (
              <div className="expenses-list">
                {expenses.map((expense) => (
                  <div className="expense-row" key={expense.id || `${expense.description}-${expense.paid_by}`}>
                    <div className="expense-details">
                      <strong>{expense.description}</strong>
                      <span className="expense-category">{expense.category || 'Other'}</span>
                      <span>Paid by: {getMemberLabel(expense.paid_by, tripMembers, profiles)}</span>
                    </div>
                    <div className="expense-row-actions">
                    <span className="expense-amount">{expense.amount}</span>
                      <button className="expense-edit-button" type="button" onClick={() => openEditExpenseForm(expense)} disabled={deletingExpenseId !== '' || isExpenseSaving}>Edit</button>
                      <button className="expense-delete-button" type="button" onClick={() => handleDeleteExpense(expense.id)} disabled={deletingExpenseId !== '' || isExpenseSaving}>
                        {deletingExpenseId === expense.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {isTripFormOpen && (
        <div className="auth-backdrop" role="presentation" onMouseDown={closeTripForm}>
          <section
            className="auth-modal trip-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="close-button" type="button" aria-label="Close create trip form" onClick={closeTripForm}>×</button>
            <p className="eyebrow">Start planning</p>
            <h2 id="trip-form-title">Create a trip.</h2>
            <p className="form-introduction">Add the basic details and invite your group later.</p>
            <form onSubmit={handleTripSubmit}>
              <label>
                Trip name
                <input name="name" type="text" value={tripFormValues.name} onChange={handleTripInputChange} required />
              </label>
              <label>
                Destination
                <input name="destination" type="text" value={tripFormValues.destination} onChange={handleTripInputChange} required />
              </label>
              <div className="date-fields">
                <label>
                  Start date
                  <input name="startDate" type="date" value={tripFormValues.startDate} onChange={handleTripInputChange} required />
                </label>
                <label>
                  End date
                  <input name="endDate" type="date" value={tripFormValues.endDate} onChange={handleTripInputChange} required />
                </label>
              </div>
              {tripFormMessage && <p className="auth-message error" role="alert">{tripFormMessage}</p>}
              <button className="auth-submit" type="submit" disabled={isTripSaving}>
                {isTripSaving ? 'Creating trip…' : 'Create trip'}
              </button>
            </form>
          </section>
        </div>
      )}

      {isAuthOpen && (
        <div className="auth-backdrop" role="presentation" onMouseDown={closeAuth}>
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="close-button" type="button" aria-label="Close authentication form" onClick={closeAuth}>×</button>
            <p className="eyebrow">{authMode === 'login' ? 'Welcome back' : 'Start planning'}</p>
            <h2 id="auth-title">{authMode === 'login' ? 'Log in to your account.' : 'Create your account.'}</h2>
            <p className="auth-switch">
              {authMode === 'login' ? 'New to GroupTrip Planner?' : 'Already have an account?'}
              <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthMessage({ type: '', text: '' }) }}>
                {authMode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </p>

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'signup' && (
                <label>
                  Full name
                  <input name="fullName" type="text" value={formValues.fullName} onChange={handleInputChange} required autoComplete="name" />
                </label>
              )}
              <label>
                Email
                <input name="email" type="email" value={formValues.email} onChange={handleInputChange} required autoComplete="email" />
              </label>
              <label>
                Password
                <input name="password" type="password" value={formValues.password} onChange={handleInputChange} required minLength="6" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
              </label>
              {authMode === 'signup' && (
                <label>
                  Confirm password
                  <input name="confirmPassword" type="password" value={formValues.confirmPassword} onChange={handleInputChange} required minLength="6" autoComplete="new-password" />
                </label>
              )}
              {authMessage.text && (
                <p className={`auth-message ${authMessage.type}`} role="status">{authMessage.text}</p>
              )}
              <button className="auth-submit" type="submit" disabled={isLoading}>
                {isLoading
                  ? authMode === 'login' ? 'Signing in…' : 'Creating account…'
                  : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
