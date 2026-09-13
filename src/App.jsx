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

function App() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState({ type: '', text: '' })
  const [trips, setTrips] = useState([])
  const [isTripsLoading, setIsTripsLoading] = useState(false)
  const [tripsError, setTripsError] = useState('')
  const [tripSuccessMessage, setTripSuccessMessage] = useState('')
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
  const [expenseFormMessage, setExpenseFormMessage] = useState({ type: '', text: '' })
  const [expenseFormValues, setExpenseFormValues] = useState({
    description: '',
    amount: '',
    paidBy: '',
    sharedBy: [],
    category: 'Other',
  })
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [isMemberSaving, setIsMemberSaving] = useState(false)
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
      setIsTripsLoading(true)
      setTripsError('')

      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('created_by', session.user.id)
        .order('start_date', { ascending: true })

      if (error) {
        setTripsError('We could not load your trips. Please try again.')
      } else {
        setTrips(data || [])
      }

      setIsTripsLoading(false)
    }

    loadTrips()
  }, [session])

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
  }, [refreshTripMembers, selectedTrip])

  useEffect(() => {
    if (!selectedTrip) {
      return
    }

    const loadExpenses = async () => {
      setIsExpensesLoading(true)
      setExpensesError('')

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', selectedTrip.id)

      if (error) {
        setExpensesError('We could not load the expenses for this trip. Please try again.')
      } else {
        setExpenses(data || [])

        if (!data || data.length === 0) {
          setExpenseSplits([])
        } else {
          const expenseIds = data.map((expense) => expense.id)
          const { data: splitData, error: splitError } = await supabase
            .from('expense_splits')
            .select('*')
            .in('expense_id', expenseIds)

          if (splitError) {
            setExpensesError('Expenses loaded, but we could not load their splits.')
            setExpenseSplits([])
          } else {
            setExpenseSplits(splitData || [])
          }
        }
      }

      setIsExpensesLoading(false)
    }

    loadExpenses()
  }, [selectedTrip])

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
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthMessage({ type: 'error', text: 'We could not log you out. Please try again.' })
    }
  }

  const openTripDetails = (trip) => {
    setSelectedTrip(trip)
    setTripMembers([])
    setMembersError('')
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
      return
    }

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
    setExpenseFormMessage({ type: '', text: '' })
    setIsAddExpenseOpen(true)
  }

  const closeAddExpenseForm = () => {
    if (!isExpenseSaving) {
      setIsAddExpenseOpen(false)
      setExpenseFormMessage({ type: '', text: '' })
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

    const amountPerMember = Number(expenseFormValues.amount) / expenseFormValues.sharedBy.length
    const splitRows = expenseFormValues.sharedBy.map((userId) => ({
      expense_id: createdExpense.id,
      user_id: userId,
      amount_owed: amountPerMember,
    }))
    const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)

    if (splitError) {
      setExpenseFormMessage({
        type: 'error',
        text: 'The expense was created, but the member splits could not be saved. Please do not add it again.',
      })
      setIsExpenseSaving(false)
      return
    }

    const { data, error: refreshError } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', selectedTrip.id)

    if (refreshError) {
      setExpensesError('The expense was added, but we could not refresh the expense list.')
    } else {
      setExpenses(data || [])
      const expenseIds = (data || []).map((expense) => expense.id)

      if (expenseIds.length === 0) {
        setExpenseSplits([])
      } else {
        const { data: splitData, error: splitError } = await supabase
          .from('expense_splits')
          .select('*')
          .in('expense_id', expenseIds)

        if (splitError) {
          setExpensesError('The expense was added, but we could not refresh its splits.')
        } else {
          setExpenseSplits(splitData || [])
        }
      }
    }

    clearExpenseForm()
    setIsAddExpenseOpen(false)
    setExpenseFormMessage({ type: 'success', text: 'Expense added successfully.' })
    setIsExpenseSaving(false)
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

    const { data, error: loadError } = await supabase
      .from('trips')
      .select('*')
      .eq('created_by', session.user.id)
      .order('start_date', { ascending: true })

    if (!loadError) {
      setTrips(data || [])
    }
  }

  const userName = session?.user?.user_metadata?.full_name
  const userLabel = userName || session?.user?.email
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
                <button className="login-button" type="button" onClick={handleLogout}>Logout</button>
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
              <div className="trips-heading">
                <div>
                  <p className="eyebrow">Your travel plans</p>
                  <h2>My <span>trips.</span></h2>
                </div>
                <button className="secondary-button" type="button" onClick={openTripForm}>Create another trip</button>
              </div>
              {tripSuccessMessage && <p className="trip-success" role="status">{tripSuccessMessage}</p>}
              {isTripsLoading && <p className="trips-status">Loading your trips…</p>}
              {!isTripsLoading && tripsError && <p className="trips-status trips-error">{tripsError}</p>}
              {!isTripsLoading && !tripsError && trips.length === 0 && (
                <p className="trips-status">You have no trips yet. Create one to start planning.</p>
              )}
              {!isTripsLoading && !tripsError && trips.length > 0 && (
                <div className="trips-grid">
                  {trips.map((trip) => (
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
                      <h3>{trip.name}</h3>
                      <p className="trip-destination">{trip.destination}</p>
                      <p className="trip-dates">{trip.start_date} <span aria-hidden="true">→</span> {trip.end_date}</p>
                    </article>
                  ))}
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
              <p className="trip-dates">{selectedTrip.start_date} <span aria-hidden="true">→</span> {selectedTrip.end_date}</p>
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

            <div className="spending-insights">
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
                    {isMemberSaving ? 'Adding member…' : 'Add member'}
                  </button>
                  <button className="cancel-button" type="button" onClick={closeAddMemberForm} disabled={isMemberSaving}>Cancel</button>
                </div>
              </form>
            )}
            {!isAddMemberOpen && memberFormMessage.type === 'success' && (
              <p className="auth-message success member-success" role="status">{memberFormMessage.text}</p>
            )}
            {isMembersLoading && <p className="trips-status">Loading members…</p>}
            {!isMembersLoading && membersError && <p className="trips-status trips-error">{membersError}</p>}
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
              <form className="expense-form" onSubmit={handleAddExpenseSubmit}>
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
                    {isExpenseSaving ? 'Adding expense…' : 'Add expense'}
                  </button>
                  <button className="cancel-button" type="button" onClick={closeAddExpenseForm} disabled={isExpenseSaving}>Cancel</button>
                </div>
              </form>
            )}
            {!isAddExpenseOpen && expenseFormMessage.type === 'success' && (
              <p className="auth-message success member-success" role="status">{expenseFormMessage.text}</p>
            )}
            {isExpensesLoading && <p className="trips-status">Loading expenses…</p>}
            {!isExpensesLoading && expensesError && <p className="trips-status trips-error">{expensesError}</p>}
            {!isExpensesLoading && !expensesError && expenses.length === 0 && (
              <p className="trips-status">No expenses added yet.</p>
            )}
            {!isExpensesLoading && !expensesError && expenses.length > 0 && (
              <div className="expenses-list">
                {expenses.map((expense) => (
                  <div className="expense-row" key={expense.id || `${expense.description}-${expense.paid_by}`}>
                    <div>
                      <strong>{expense.description}</strong>
                    <span className="expense-category">{expense.category || 'Other'}</span>
                    <span>Paid by: {getMemberLabel(expense.paid_by, tripMembers, profiles)}</span>
                  </div>
                    <span className="expense-amount">{expense.amount}</span>
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
                {isTripSaving ? 'Saving trip…' : 'Create trip'}
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
                {isLoading ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
