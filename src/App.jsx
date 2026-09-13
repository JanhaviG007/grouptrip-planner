import { useEffect, useState } from 'react'
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

function getMemberLabel(userId, members) {
  const memberIndex = members.findIndex((member) => member.user_id === userId)
  return memberIndex >= 0 ? `Member ${memberIndex + 1}` : 'Unknown member'
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
  const [isMembersLoading, setIsMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [expenses, setExpenses] = useState([])
  const [isExpensesLoading, setIsExpensesLoading] = useState(false)
  const [expensesError, setExpensesError] = useState('')
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [isExpenseSaving, setIsExpenseSaving] = useState(false)
  const [expenseFormMessage, setExpenseFormMessage] = useState({ type: '', text: '' })
  const [expenseFormValues, setExpenseFormValues] = useState({
    description: '',
    amount: '',
    paidBy: '',
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

      const { data, error } = await supabase
        .from('trip_members')
        .select('*')
        .eq('trip_id', selectedTrip.id)

      if (error) {
        setMembersError('We could not load the members for this trip. Please try again.')
      } else {
        setTripMembers(data || [])
      }

      setIsMembersLoading(false)
    }

    loadTripMembers()
  }, [selectedTrip])

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

    const { data: refreshedMembers, error: refreshError } = await supabase
      .from('trip_members')
      .select('*')
      .eq('trip_id', selectedTrip.id)

    if (refreshError) {
      setMembersError('The member was added, but we could not refresh the member list.')
    } else {
      setTripMembers(refreshedMembers || [])
    }

    clearMemberForm()
    setIsAddMemberOpen(false)
    setMemberFormMessage({ type: 'success', text: 'Member added successfully.' })
    setIsMemberSaving(false)
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
    })
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

    setIsExpenseSaving(true)

    const { error } = await supabase.from('expenses').insert({
      trip_id: selectedTrip.id,
      paid_by: expenseFormValues.paidBy,
      description: expenseFormValues.description.trim(),
      amount: Number(expenseFormValues.amount),
    })

    if (error) {
      setExpenseFormMessage({ type: 'error', text: 'We could not save this expense. Please try again.' })
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
    const spent = expenses
      .filter((expense) => expense.paid_by === member.user_id)
      .reduce((total, expense) => total + Number(expense.amount || 0), 0)

    return {
      userId: member.user_id,
      label: `Member ${tripMembers.indexOf(member) + 1}`,
      budget,
      spent,
      remaining: budget - spent,
      percentage: budget > 0 ? (spent / budget) * 100 : 0,
    }
  })
  const totalTripBudget = budgetSummaries.reduce((total, member) => total + member.budget, 0)
  const totalTripSpending = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const totalTripRemaining = totalTripBudget - totalTripSpending

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
                            <span>Spent: {formatCurrency(member.spent)}</span>
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

            <div className="members-heading">
              <h3>Trip Members</h3>
              <button className="secondary-button" type="button" onClick={openAddMemberForm}>Add Member</button>
            </div>
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
                {tripMembers.map((member, index) => (
                  <div className="member-row" key={member.user_id}>
                    <span className="member-id">{`Member ${index + 1}`}</span>
                    <span className="member-budget">
                      {member.budget === null || member.budget === undefined ? 'Budget not set' : `Budget: ${member.budget}`}
                    </span>
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
                    {tripMembers.map((member, index) => (
                      <option key={member.user_id} value={member.user_id}>{`Member ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
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
                      <span>Paid by: {getMemberLabel(expense.paid_by, tripMembers)}</span>
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
